"""Read official scorecards. Fail closed when the published format changes."""
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
import re
import subprocess
from tempfile import TemporaryDirectory
from urllib.parse import urljoin, urlparse

import httpx

from app.schemas.scorecard import ScorecardData

LONNIE_CARD = 'https://lonniepoolegolfcourse.com/about/scorecard/'
LONNIE_RATINGS = 'https://lonniepoolegolfcourse.com/about/ratings-slopes/'
RGA_PAGE = 'https://www.rgagolf.net/18-hole-course/'
SOURCES = [
    {'id': 'rga-public', 'name': 'Raleigh Golf Association — Public 18', 'address': '1527 Tryon Road, Raleigh, NC', 'osm_id': 'relation/6406053'},
    {'id': 'lonnie-poole', 'name': 'Lonnie Poole Golf Course', 'address': '1509 Main Campus Drive, Raleigh, NC', 'osm_id': 'way/430436305'},
]


class SourceFormatError(ValueError):
    pass


class Tables(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows, self.row, self.links = [], [], []
        self.cell = None

    def handle_starttag(self, tag, attrs):
        if tag == 'tr':
            if self.row:
                self.rows.append(self.row)
            self.row = []
        if tag in ('td', 'th'):
            self.cell = ''
        if tag == 'a':
            self.links.append(dict(attrs).get('href', ''))

    def handle_data(self, data):
        if self.cell is not None:
            self.cell += data

    def handle_endtag(self, tag):
        if tag in ('td', 'th') and self.cell is not None:
            self.row.append(' '.join(self.cell.split()))
            self.cell = None
        if tag == 'tr' and self.row:
            self.rows.append(self.row)
            self.row = []


def _fetch(url: str, host: str) -> bytes:
    with httpx.Client(timeout=httpx.Timeout(20, connect=8), headers={'User-Agent': 'golf-analytics/1.0 scorecard-import'}) as client:
        for _ in range(3):
            parsed = urlparse(url)
            if parsed.scheme != 'https' or parsed.netloc != host:
                raise SourceFormatError('The scorecard link left the official course website')
            with client.stream('GET', url) as response:
                if response.is_redirect:
                    url = urljoin(url, response.headers['location'])
                    continue
                response.raise_for_status()
                result = bytearray()
                for chunk in response.iter_bytes():
                    result.extend(chunk)
                    if len(result) > 10_000_000:
                        raise SourceFormatError('The source file is too large')
                return bytes(result)
    raise SourceFormatError('Too many redirects on the official website')


def pdf_text(data: bytes) -> str:
    if not data.startswith(b'%PDF'):
        raise SourceFormatError('The scorecard link did not return a PDF')
    with TemporaryDirectory(prefix='golf-scorecard-') as folder:
        path = Path(folder) / 'card.pdf'
        path.write_bytes(data)
        try:
            return subprocess.run(['pdftotext', '-layout', str(path), '-'], check=True,
                                  timeout=15, capture_output=True, text=True).stdout
        except (OSError, subprocess.SubprocessError) as exc:
            raise SourceFormatError('Could not read the scorecard PDF. The server needs poppler-utils (pdftotext).') from exc


def _holes(pars, indexes):
    return [{'number': i + 1, 'par': p, 'stroke_index': indexes[i]} for i, p in enumerate(pars)]


def parse_lonnie(card_html: str, ratings_html: str) -> dict:
    card, ratings = Tables(), Tables()
    card.feed(card_html)
    ratings.feed(ratings_html)
    par_rows = [r for r in card.rows if r[0].lower() == 'par']
    index_rows = [r for r in card.rows if r[0].lower() == 'handicap']
    if len(par_rows) != 2 or len(index_rows) != 2:
        raise SourceFormatError('The published scorecard layout changed')
    pars = [int(v) for r in par_rows for v in r[1:10]]
    indexes = [int(v) for r in index_rows for v in r[1:10]]
    yardages = {}
    for row in card.rows:
        if len(row) == 12 and row[0] not in ('', 'Hole', 'Par', 'Handicap'):
            yardages[row[0]] = int(row[-1])
    tees = []
    for row in ratings.rows:
        if len(row) != 6 or row[1] not in ('M', 'W'):
            continue
        name, category, full, slope, front, back = row
        front_rating, front_slope = front.split('/')
        back_rating, back_slope = back.split('/')
        tees.append({'key': f'{name}:{category}', 'name': f'{name} — {"Men" if category == "M" else "Women"}',
                     'yardage': yardages[name], 'ratings': [
                         {'scope': '18', 'course_rating': float(full), 'slope_rating': int(slope), 'par': sum(pars)},
                         {'scope': 'front9', 'course_rating': float(front_rating), 'slope_rating': int(front_slope), 'par': sum(pars[:9])},
                         {'scope': 'back9', 'course_rating': float(back_rating), 'slope_rating': int(back_slope), 'par': sum(pars[9:])},
                     ]})
    if len(tees) != 12 or len(yardages) != 7:
        raise SourceFormatError('The published tee table changed; review the source before importing')
    return {'holes': _holes(pars, indexes), 'tees': tees, 'notes': [
        'Men’s and women’s ratings are separate tee choices. Ratings are copied as published; nine-hole ratings are not estimated.',
    ]}


def parse_rga(text: str) -> dict:
    def halves(label):
        matches = re.findall(rf'^\s*{re.escape(label)}\s+(.+?)\s+{re.escape(label)}\s+(.+?)\s*$', text, re.M | re.I)
        if len(matches) != 1:
            raise SourceFormatError(f'The published {label} row changed')
        return [[int(n) for n in re.findall(r'\d+', half)] for half in matches[0]]

    front, back = halves('Par')
    if len(front) != 10 or len(back) != 11 or sum(front[:9]) != front[9] or sum(back[:9]) != back[9] or front[9] + back[9] != back[10]:
        raise SourceFormatError('The published par totals are inconsistent')
    pars = front[:9] + back[:9]
    indexes = sum(halves('Hdcp.'), [])
    tees = []
    for name in ['Blue', 'White', 'Gold', 'Red', 'Green']:
        first, last = halves(name)
        if len(first) != 10 or len(last) != 11 or sum(first[:9]) != first[9] or sum(last[:9]) != last[9] or first[9] + last[9] != last[10]:
            raise SourceFormatError(f'The published {name} yardages are inconsistent')
        rating = re.findall(rf'{name}\s+Tees\s+(\d+\.\d+)\s*/\s*(\d+)', text, re.I)
        if len(rating) != 1:
            raise SourceFormatError(f'The published {name} rating changed')
        tees.append({'key': name.lower(), 'name': name, 'yardage': last[-1], 'ratings': [
            {'scope': '18', 'course_rating': float(rating[0][0]), 'slope_rating': int(rating[0][1]), 'par': sum(pars)},
        ]})
    return {'holes': _holes(pars, indexes), 'tees': tees, 'notes': [
        'Public 18-hole course only; this is not the Stockholders course.',
        'The published card does not label rating gender/category or provide nine-hole ratings. Confirm the listed rating applies to you before using it for handicap tracking.',
    ]}


def fetch_scorecard(source_id: str) -> ScorecardData:
    if source_id == 'lonnie-poole':
        parsed = parse_lonnie(_fetch(LONNIE_CARD, 'lonniepoolegolfcourse.com').decode(),
                              _fetch(LONNIE_RATINGS, 'lonniepoolegolfcourse.com').decode())
        urls, name = [LONNIE_CARD, LONNIE_RATINGS], 'Lonnie Poole Golf Course'
    elif source_id == 'rga-public':
        page = Tables()
        page.feed(_fetch(RGA_PAGE, 'www.rgagolf.net').decode())
        links = list(dict.fromkeys(urljoin(RGA_PAGE, link) for link in page.links
                                  if 'scorecard' in link.lower() and urlparse(link).path.lower().endswith('.pdf')))
        if len(links) != 1:
            raise SourceFormatError('Could not identify the official public-course scorecard')
        parsed = parse_rga(pdf_text(_fetch(links[0], 'www.rgagolf.net')))
        urls, name = [RGA_PAGE, links[0]], 'Raleigh Golf Association — Public 18'
    else:
        raise SourceFormatError('Unsupported scorecard source')
    return ScorecardData(source_id=source_id, course_name=name, source_urls=urls,
                         retrieved_at=datetime.now(timezone.utc), **parsed)

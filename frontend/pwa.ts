import { workerSource } from './workerSource.js';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { Plugin } from 'vite';

// Precache the complete production build, including lazy scoring/map chunks.
// API responses and third-party map tiles never enter this cache.
export function offlineApp(): Plugin {
  let directory='';
  return {name:'golf-offline-app',apply:'build',configResolved(config){directory=resolve(config.root,config.build.outDir);},
    closeBundle(){
      function files(dir:string):string[]{return readdirSync(dir,{withFileTypes:true}).flatMap(item=>item.isDirectory()?files(join(dir,item.name)):[join(dir,item.name)]);}
      const assets=files(directory).filter(file=>!file.endsWith('/sw.js'));
      const version=createHash('sha256');for(const file of assets)version.update(relative(directory,file)).update(readFileSync(file));
      const urls=assets.map(file=>'/'+relative(directory,file).replaceAll('\\','/'));
      const source=workerSource('golf-shell-'+version.digest('hex').slice(0,16),urls);
    writeFileSync(join(directory,'sw.js'),source);
    }};
}

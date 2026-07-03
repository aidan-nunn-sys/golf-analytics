import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import App from './App';

describe('App smoke test', () => {
  it('should render and mount the app', () => {
    const { container } = render(<App />);
    // The app should be mounted without crashing
    expect(container).toBeTruthy();
  });
});

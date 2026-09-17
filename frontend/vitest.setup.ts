import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import i18n from './src/i18n';

// Ensure language is set to 'th' for tests
i18n.changeLanguage('th');

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

global.ResizeObserver = ResizeObserverMock;
if (typeof window !== 'undefined') {
  window.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  window.URL.revokeObjectURL = vi.fn();
}

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LoginMethodLocal } from '../../src/features/auth/login-method-local';

describe('LoginMethodLocal', () => {
  it('toggles the password input between password and text', () => {
    render(
      <LoginMethodLocal
        open
        onToggle={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    const passwordInput = screen.getByLabelText('รหัสผ่าน');
    const toggleButton = screen.getByRole('button', { name: 'แสดง' });

    expect(passwordInput).toHaveAttribute('type', 'password');

    fireEvent.click(toggleButton);
    expect(passwordInput).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'ซ่อน' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'ซ่อน' }));
    expect(passwordInput).toHaveAttribute('type', 'password');
  });
});

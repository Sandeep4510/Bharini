import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
jest.mock('@/lib/auth', () => ({ useAuth: jest.fn() }));

import { ApiError } from '@bharini/api-client';
import { useAuth } from '@/lib/auth';
import LoginScreen from '@/app/(auth)/login';

const mockUseAuth = jest.mocked(useAuth);
const mockLogin = jest.fn();

describe('login screen input and error handling', () => {
  beforeEach(() => {
    mockLogin.mockReset();
    mockUseAuth.mockReturnValue({
      user: null,
      ready: true,
      login: mockLogin,
      logout: jest.fn(),
      refresh: jest.fn(),
    });
  });

  it('rejects empty credentials before making an API request', async () => {
    await render(<LoginScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Log in' }));

    expect(screen.getByText('Enter your email and password.')).toBeTruthy();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('trims email but passes the password exactly as entered', async () => {
    mockLogin.mockResolvedValue(undefined);
    await render(<LoginScreen />);

    await fireEvent.changeText(screen.getByLabelText('Email'), ' artist@example.com ');
    await fireEvent.changeText(screen.getByLabelText('Password'), ' pass phrase ');
    await fireEvent.press(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith('artist@example.com', ' pass phrase '));
  });

  it('shows server authentication errors without losing their message', async () => {
    mockLogin.mockRejectedValue(new ApiError('Invalid credentials', { detail: ['Invalid email or password.'] }, 400));
    await render(<LoginScreen />);

    await fireEvent.changeText(screen.getByLabelText('Email'), 'artist@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'Password123!');
    await fireEvent.press(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => expect(screen.getByText('Invalid email or password.')).toBeTruthy());
  });
});

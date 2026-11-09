import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button, Field } from '@/components/ui';

describe('shared accessible input and button components', () => {
  it('keeps secret fields concealed until the user asks to show them', async () => {
    await render(<Field label="Password" secret />);

    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
    await fireEvent.press(screen.getByRole('button', { name: 'Show' }));
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false);
    await fireEvent.press(screen.getByRole('button', { name: 'Hide' }));
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
  });

  it('does not submit a busy button', async () => {
    const onPress = jest.fn();
    await render(<Button title="Log in" busy onPress={onPress} />);

    expect(screen.getByRole('button').props.accessibilityState).toEqual({ disabled: true, busy: true });
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('submits a normal button once', async () => {
    const onPress = jest.fn();
    await render(<Button title="Continue" onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

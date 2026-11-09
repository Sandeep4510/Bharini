jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

import { router } from 'expo-router';

import { finishCamera, openCamera } from '@/lib/camera';

describe('camera route handoff', () => {
  beforeEach(() => {
    finishCamera(null);
    jest.clearAllMocks();
  });

  it('passes safe defaults and resolves a captured URI', async () => {
    const result = openCamera();
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/camera',
      params: { pose: '', facing: 'back' },
    });

    finishCamera('file:///cache/capture.jpg');
    await expect(result).resolves.toBe('file:///cache/capture.jpg');
  });

  it('passes the requested pose and camera facing', () => {
    openCamera({ pose: 'center', facing: 'front' });
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/camera',
      params: { pose: 'center', facing: 'front' },
    });
    finishCamera(null);
  });

  it('resolves a superseded camera request as cancelled instead of leaving it pending', async () => {
    const oldRequest = openCamera();
    const newRequest = openCamera({ facing: 'front' });

    await expect(oldRequest).resolves.toBeNull();
    finishCamera(null);
    await expect(newRequest).resolves.toBeNull();
  });

  it('ignores repeated completion after the camera route has closed', () => {
    expect(() => {
      finishCamera(null);
      finishCamera('file:///cache/late.jpg');
    }).not.toThrow();
  });
});

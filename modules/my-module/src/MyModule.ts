import { NativeModule, requireNativeModule } from 'expo';

declare class MyModule extends NativeModule {
  activateKaraokeSession(): Promise<string>;
  forceSpeaker(): Promise<string>;
  getCurrentRoute(): string;
  isSpeaker(): boolean;
}

export default requireNativeModule<MyModule>('MyModule');

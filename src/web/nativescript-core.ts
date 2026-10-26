export const ApplicationSettings = {
  getString(key: string): string | undefined {
    return localStorage.getItem(key) ?? undefined;
  },
  setString(key: string, value: string): void {
    localStorage.setItem(key, value);
  },
};

export const CoreTypes = {
  AnimationCurve: {
    easeOut: 'easeOut',
    spring: 'spring',
  },
};

export const Dialogs = {
  confirm(options: { title: string; message: string }): Promise<boolean> {
    return Promise.resolve(window.confirm(`${options.title}\n\n${options.message}`));
  },
};

export const Screen = {
  mainScreen: {
    get widthDIPs() {
      return window.innerWidth;
    },
    get heightDIPs() {
      return window.innerHeight;
    },
    get scale() {
      return window.devicePixelRatio || 1;
    },
  },
};

export const defaultPackageJson = {
  name: "novum-app",
  version: "1.0.0",
  dependencies: {
    react: "^18.2.0",
    "react-dom": "^18.2.0",
    clsx: "^2.1.0",
    "tailwind-merge": "^2.2.0",
  },
};

export const packageJsonTemplate = JSON.stringify(defaultPackageJson, null, 2);

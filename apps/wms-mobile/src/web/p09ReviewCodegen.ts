// Fail instead of silently replacing a native component in the offline audit.
export default function codegenNativeComponent(name: string): never {
  throw new Error(
    'Unexpected native-only component in browser review: ' + name,
  );
}

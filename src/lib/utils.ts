export function readFileAsDataURL(file: File) {
  return new Promise<string>((res, rej) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      res(reader.result as string);
    };
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

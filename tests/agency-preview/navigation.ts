export const useRouter = () => ({
  push: (href: string) => window.alert(`Destino de prueba: ${href}`),
});

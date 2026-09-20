import RegisterServiceWorker from "@/components/team/RegisterServiceWorker";

export default function TeamRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RegisterServiceWorker />
      {children}
    </>
  );
}

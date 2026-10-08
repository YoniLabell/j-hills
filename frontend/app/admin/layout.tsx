import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | Admin" },
  robots: { index: false, follow: false },
};

/** The owner dashboard is English-only and always left-to-right. */
export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div dir="ltr" lang="en" className="flex min-h-screen flex-col bg-sand-50 text-start">
      {children}
    </div>
  );
}

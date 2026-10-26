import { redirect } from 'next/navigation';
import { currentAdmin } from '@/lib/auth';
import AdminNav from '@/components/admin/AdminNav';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Administrace | Katalog hostesek', robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const a = await currentAdmin();
  if (!a) redirect('/admin/login');
  return (
    <div className="adm">
      <AdminNav name={a.name} role={a.role} />
      <main className="adm-main">{children}</main>
    </div>
  );
}

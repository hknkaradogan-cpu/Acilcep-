import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { isConfigured } from './lib/supabase';
import { I18nProvider, useI18n } from './lib/i18n';
import { AuthProvider, useAuth } from './lib/auth';
import { DataProvider } from './lib/data';
import Layout from './components/Layout';
import { Alert, Button, Loading } from './components/ui';
import Landing from './pages/Landing';
import Auth, { ResetPassword } from './pages/Auth';
import { NotFound, SetupMissing } from './pages/Misc';

const Home = lazy(() => import('./pages/Home'));
const NewRequest = lazy(() => import('./pages/NewRequest'));
const RequestDetail = lazy(() => import('./pages/RequestDetail'));
const OrdersList = lazy(() => import('./pages/Orders').then((m) => ({ default: m.OrdersList })));
const OrderDetail = lazy(() => import('./pages/Orders').then((m) => ({ default: m.OrderDetail })));
const Inbox = lazy(() => import('./pages/Messages').then((m) => ({ default: m.Inbox })));
const Chat = lazy(() => import('./pages/Messages').then((m) => ({ default: m.Chat })));
const Notifications = lazy(() => import('./pages/Notifications'));
const Profile = lazy(() => import('./pages/Profile'));
const SupplierPublic = lazy(() => import('./pages/SupplierPublic'));
const Admin = lazy(() => import('./pages/Admin'));

function Protected({ children }: { children: ReactNode }) {
  const { session, profile, loading, signOut } = useAuth();
  const { t } = useI18n();
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/login" replace />;
  if (!profile)
    return (
      <div className="mx-auto max-w-md space-y-3 p-6">
        <Alert>{t('error')}</Alert>
        <Button className="w-full" onClick={() => location.reload()}>{t('retry')}</Button>
        <Button variant="secondary" className="w-full" onClick={signOut}>{t('signOut')}</Button>
      </div>
    );
  if (profile.is_suspended)
    return (
      <div className="mx-auto max-w-md space-y-3 p-6">
        <Alert>{t('suspended')}</Alert>
        <Button variant="secondary" className="w-full" onClick={signOut}>{t('signOut')}</Button>
      </div>
    );
  return <>{children}</>;
}

function RootSwitch() {
  const { session, loading } = useAuth();
  if (loading) return <Loading />;
  return session ? <Navigate to="/app" replace /> : <Landing />;
}

function AppRoutes() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<RootSwitch />} />
        <Route path="/login" element={<Auth mode="login" />} />
        <Route path="/signup" element={<Auth mode="signup" />} />
        <Route path="/forgot" element={<Auth mode="forgot" />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route element={<Protected><Layout /></Protected>}>
          <Route path="/app" element={<Home />} />
          <Route path="/requests/new" element={<NewRequest />} />
          <Route path="/requests/:id" element={<RequestDetail />} />
          <Route path="/orders" element={<OrdersList />} />
          <Route path="/orders/:id" element={<OrderDetail />} />
          <Route path="/messages" element={<Inbox />} />
          <Route path="/messages/:requestId/:otherId" element={<Chat />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/suppliers/:id" element={<SupplierPublic />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <I18nProvider>
      {isConfigured ? (
        <AuthProvider>
          <DataProvider>
            <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
              <AppRoutes />
            </BrowserRouter>
          </DataProvider>
        </AuthProvider>
      ) : (
        <SetupMissing />
      )}
    </I18nProvider>
  );
}

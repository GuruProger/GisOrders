import { createBrowserRouter, createRoutesFromElements, Route } from 'react-router'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { AppShell } from '@/widgets/app-shell/AppShell'
import { FeedPage } from '@/pages/feed/FeedPage'
import { LoginPage } from '@/pages/login/LoginPage'
import { NotFoundPage } from '@/pages/not-found/NotFoundPage'
import { ProfilePage } from '@/pages/profile/ProfilePage'
import { RegisterPage } from '@/pages/register/RegisterPage'

/** Temporary heading-only page for routes owned by the next plan. */
function StubPage({ title }: { title: string }) {
  return <h1 className="text-2xl font-semibold text-forest-900">{title}</h1>
}

export const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<FeedPage />} />
          <Route path="/my/orders" element={<StubPage title="Мои заказы" />} />
          <Route path="/my/proposals" element={<StubPage title="Мои отклики" />} />
          <Route path="/map" element={<StubPage title="Карта" />} />
          <Route path="/chats" element={<StubPage title="Чаты" />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </>,
  ),
)

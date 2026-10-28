import { createBrowserRouter, createRoutesFromElements, Navigate, Route } from 'react-router'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { LoginPage } from '@/pages/login/LoginPage'
import { RegisterPage } from '@/pages/register/RegisterPage'

/** Placeholder for the protected shell until the feed task lands. */
function ProtectedHome() {
  return <div />
}

export const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route element={<RequireAuth />}>
        <Route path="/" element={<ProtectedHome />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </>,
  ),
)

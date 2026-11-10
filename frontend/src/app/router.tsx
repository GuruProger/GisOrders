import { createBrowserRouter, createRoutesFromElements, Route } from 'react-router'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { AppShell } from '@/widgets/app-shell/AppShell'
import { ChatPage } from '@/pages/chat/ChatPage'
import { ChatsPage } from '@/pages/chats/ChatsPage'
import { FeedPage } from '@/pages/feed/FeedPage'
import { LoginPage } from '@/pages/login/LoginPage'
import { MapPage } from '@/pages/map/MapPage'
import { MyOrdersPage } from '@/pages/my-orders/MyOrdersPage'
import { MyProposalsPage } from '@/pages/my-proposals/MyProposalsPage'
import { NotFoundPage } from '@/pages/not-found/NotFoundPage'
import { OrderEditPage } from '@/pages/order-edit/OrderEditPage'
import { OrderPage } from '@/pages/order/OrderPage'
import { ProfilePage } from '@/pages/profile/ProfilePage'
import { RegisterPage } from '@/pages/register/RegisterPage'

export const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<FeedPage />} />
          <Route path="/my/orders" element={<MyOrdersPage />} />
          <Route path="/my/proposals" element={<MyProposalsPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/orders/new" element={<OrderEditPage />} />
          <Route path="/orders/:id/edit" element={<OrderEditPage />} />
          <Route path="/orders/:id" element={<OrderPage />} />
          <Route path="/chats" element={<ChatsPage />} />
          <Route path="/chats/:id" element={<ChatPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </>,
  ),
)

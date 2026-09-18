import { Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { CreateRoomPage } from './pages/CreateRoomPage'
import { HomePage } from './pages/HomePage'
import { JoinRoomPage } from './pages/JoinRoomPage'
import { LobbyPage } from './pages/LobbyPage'
import { NotFoundPage } from './pages/NotFoundPage'

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="create" element={<CreateRoomPage />} />
        <Route path="join" element={<JoinRoomPage />} />
        <Route path="join/:roomCode" element={<JoinRoomPage />} />
        <Route path="room/:roomCode" element={<LobbyPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

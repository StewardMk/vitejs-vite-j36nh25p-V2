import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Homepage from './components/Homepage'
import ExamFlow from './components/ExamFlow'
import TutorDashboard from './components/TutorDashboard'
import AdminUpload from './components/AdminUpload'
import RequireTutorLogin from './components/RequireTutorLogin'
import RequireAdminLogin from './components/RequireAdminLogin'
import AdminPanel from './components/AdminPanel'
import StudentAuthPage from './components/StudentAuthPage'
import StudentAccount from './components/StudentAccount'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Homepage />} />
        <Route path="/login" element={<StudentAuthPage />} />
        <Route path="/exams" element={<Navigate to="/account?view=exams" replace />} />
        <Route path="/account" element={<StudentAccount />} />
        <Route path="/exam" element={<ExamFlow />} />
        <Route path="/tutor" element={<TutorDashboard />} />
        <Route
          path="/admin"
          element={
            <RequireTutorLogin>
              <AdminUpload />
            </RequireTutorLogin>
          }
        />
        <Route
          path="/admin-panel"
          element={
            <RequireAdminLogin>
              <AdminPanel />
            </RequireAdminLogin>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}


export default App
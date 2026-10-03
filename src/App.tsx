import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Homepage from './components/Homepage'
import ExamFlow from './components/ExamFlow'
import TutorDashboard from './components/TutorDashboard'
import AdminUpload from './components/AdminUpload'
import RequireTutorLogin from './components/RequireTutorLogin'
import StudentAuthPage from './components/StudentAuthPage'
import ExamCatalog from './components/ExamCatalog'
import StudentAccount from './components/StudentAccount'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Homepage />} />
        <Route path="/login" element={<StudentAuthPage />} />
        <Route path="/exams" element={<ExamCatalog />} />
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
      </Routes>
    </BrowserRouter>
  )
}


export default App
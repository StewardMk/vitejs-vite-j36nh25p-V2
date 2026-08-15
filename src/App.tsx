import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Homepage from './components/Homepage'
import ExamFlow from './components/ExamFlow'
import TutorDashboard from './components/TutorDashboard'
import AdminUpload from './components/AdminUpload'
import RequireTutorLogin from './components/RequireTutorLogin'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Homepage />} />
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
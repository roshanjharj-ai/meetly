import { Route, Routes } from 'react-router-dom'
import MeetingWrapper from './components/MeetingWrapper'
import StartMeeting from './components/StartMeeting'

const PageRouter = () => {
  return (
    <Routes>
      <Route path='/meet/*' element={<MeetingWrapper />} />
      <Route path='*' element={<StartMeeting />} />
    </Routes>
  )
}

export default PageRouter
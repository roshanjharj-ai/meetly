import { useState } from 'react'
import type { UserAndRoom } from '../types'
import { useNavigate } from 'react-router-dom'

const StartMeeting = () => {
    const [userNRoom, setUserNRoom] = useState<UserAndRoom>({
        room: "",
        user: ""
    })

    const navigate = useNavigate();

    const joinRoom = () => {
        navigate("meet?room=" + userNRoom.room + "&user=" + userNRoom.user);
    }
    return (
        <div className="d-flex mx-auto rounded shadow bg-white dark:bg-gray-800 p-6" style={{ height: "250px", width: "500px", marginTop: "10%" }}>
            <div className="w-100 d-flex flex-column align-items-center justify-content-between gap-2 p-6">
                <div className="d-flex flex-column align-items-center gap-4 p-6 h-100 mt-5" style={{ width: "400px" }}>
                    <input
                        placeholder="Your name"
                        value={userNRoom.user}
                        onChange={(e) => setUserNRoom((p) => ({ ...p, user: e.target.value }))}
                        className="w-100 p-2 border rounded bg-white dark:bg-gray-700 dark:border-gray-600"
                    />
                    <input
                        placeholder="Room"
                        value={userNRoom.room}
                        onChange={(e) => setUserNRoom((p) => ({ ...p, room: e.target.value }))}
                        className="w-100 p-2 border rounded bg-white dark:bg-gray-700 dark:border-gray-600"
                    />
                </div>
                <button
                    onClick={() => { joinRoom() }}
                    className="w-full py-2 rounded btn btn-primary mb-4"
                >
                    Join Room
                </button>
            </div>
        </div>
    )
}

export default StartMeeting
import { useContext, useEffect, useState } from 'react'
import { UserContext } from '../context/UserContext'
import type { UserAndRoom } from '../types'

interface request {
    joinRoom: () => void
}

const StartMeeting = ({ joinRoom }: request) => {
    const [userNRoom, setUserNRoom] = useState<UserAndRoom>({
        room: "",
        user: ""
    })
    const userContext = useContext(UserContext);

    useEffect(() => {
        userContext.setUser({ ...userNRoom });
    }, [userNRoom])
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
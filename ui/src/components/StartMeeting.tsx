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
        <div>
            <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
                <div className="join-container space-y-4 p-6 rounded shadow bg-white dark:bg-gray-800">
                    <input
                        placeholder="Your name"
                        value={userNRoom.user}
                        onChange={(e) => setUserNRoom((p) => ({ ...p, user: e.target.value }))}
                        className="w-full p-2 border rounded bg-white dark:bg-gray-700 dark:border-gray-600"
                    />
                    <input
                        placeholder="Room"
                        value={userNRoom.room}
                        onChange={(e) => setUserNRoom((p) => ({ ...p, room: e.target.value }))}
                        className="w-full p-2 border rounded bg-white dark:bg-gray-700 dark:border-gray-600"
                    />
                    <button
                        onClick={() => { joinRoom() }}
                        className="w-full py-2 rounded bg-blue-500 hover:bg-blue-600 text-white font-medium"
                    >
                        Join Room
                    </button>
                </div>
            </div>
        </div>
    )
}

export default StartMeeting
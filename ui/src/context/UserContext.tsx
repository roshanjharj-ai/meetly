import { createContext, useState, type ReactNode } from "react";
import type { UserAndRoom } from "../types";

interface UserContextType {
    user: UserAndRoom,
    setUser: (user: UserAndRoom) => void
}


export const UserContext = createContext<UserContextType>({
    user: { room: "", user: "" }, setUser: () => { }
})

interface UserContextProviderRequest {
    children: ReactNode
}

export const UserContextProvider = ({ children }: UserContextProviderRequest) => {
    const [user, setUser] = useState<UserAndRoom>({
        room: "",
        user: ""
    })

    return (
        <UserContext.Provider value={{ user, setUser }}>
            {children}
        </UserContext.Provider>
    )

}
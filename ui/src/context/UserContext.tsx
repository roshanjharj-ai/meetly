import { createContext, useState, type ReactNode } from "react";
import type { UserAndRoom } from "../types/meeting.types";

interface UserContextType {
    user: UserAndRoom | null,
    setUser: (user: UserAndRoom | null) => void
}


export const UserContext = createContext<UserContextType>({
    user: { email: "", room: "", user: "" }, setUser: () => { }
})

interface UserContextProviderRequest {
    children: ReactNode
}

export const UserContextProvider = ({ children }: UserContextProviderRequest) => {
    const [user, setUser] = useState<UserAndRoom | null>({
        email: "",
        room: "",
        user: ""
    })

    return (
        <UserContext.Provider value={{ user, setUser }}>
            {children}
        </UserContext.Provider>
    )

}
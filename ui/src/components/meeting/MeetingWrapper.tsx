import { useContext, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom';
import { UserContext } from '../../context/UserContext';
import MeetingHome from './MeetingHome';

const MeetingWrapper = () => {
    const userContext = useContext(UserContext);
    const navigate = useNavigate();
    const [searchParam] = useSearchParams();
    useEffect(() => {
        if (userContext.user?.room == "") {
            let room = searchParam.get("room");
            let user = searchParam.get("user");
            if (user != null && user != "" && room != null && room != "")
                userContext.setUser({ room: room, user: user, email: "" });
            else
                navigate("/")
        }
    }, [searchParam])
    return (
        userContext.user?.room == "" ?
            <div>Loading Room</div> :
            <MeetingHome />
    )
}

export default MeetingWrapper
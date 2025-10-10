// src/types.ts
export type Participant = {
  id: number;
  name: string;
};

export type UserAndRoom = {
  user: string,
  room: string
}

export const ControlActionTypes = {
    end: "end",
    mute: "mute",
    share: "share",
    raiseHand: "raiseHand",
    camera: "camera",
    sidebar: "sidebar"
}
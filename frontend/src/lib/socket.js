import { io } from "socket.io-client";

const socket = io("/", {
  autoConnect: false,
  transports: ["websocket"],
  auth: {
    // Token is injected at connect time from authStore
    get token() {
      return localStorage.getItem("token") || "";
    },
  },
});

export default socket;

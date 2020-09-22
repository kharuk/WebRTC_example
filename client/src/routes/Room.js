import React, { useRef, useEffect, useReducer } from "react";
import io from "socket.io-client";

const Room = (props) => {
    const userVideo = useRef();
    const partnerVideo = useRef();
    let peer = null;

    const [{socket,otherUser,userStream }, setState] = useReducer(
        (state, action) => ({ ...state, ...action }), 
    {
        socket: null,
        otherUser: null,
        userStream: null
    })

    useEffect(() => {
        navigator.mediaDevices.getUserMedia({ audio: false, video: true }).then(stream => {
            userVideo.current.srcObject = stream;
            setState({socket: io.connect("/"), userStream: stream});
        });
    }, []);

    useEffect(() => {
        if (socket) {
            socket.emit("join room", props.match.params.roomID);

            socket.on('other user', userID => {
                callUser(userID);
                setState({otherUser: userID});
            });

            socket.on("user joined", userID => {
                setState({otherUser: userID});
            });

            socket.on("offer", handleRecieveCall);

            socket.on("answer", handleAnswer);

            socket.on("ice-candidate", handleNewICECandidateMsg);
        }
    }, [socket]);

    function callUser(userID) {
        peer = createPeer(userID)
        userStream.getTracks().forEach(track => peer.addTrack(track, userStream));
    }

    function createPeer(userID) {
        const peer = new RTCPeerConnection({
            iceServers: [
                {
                    urls: "stun:stun.stunprotocol.org"
                },
                {
                    urls: 'turn:numb.viagenie.ca',
                    credential: 'muazkh',
                    username: 'webrtc@live.com'
                },
            ]
        });

        peer.onicecandidate = handleICECandidateEvent;
        peer.ontrack = handleTrackEvent;
        peer.onnegotiationneeded = () => handleNegotiationNeededEvent(userID);

        return peer;
    }

    function handleNegotiationNeededEvent(userID) {
        peer.createOffer().then(offer => {
            return peer.setLocalDescription(offer);
        }).then(() => {
            const payload = {
                target: userID,
                caller: socket.id,
                sdp: peer.localDescription
            };
            socket.emit("offer", payload);
        }).catch(e => console.log(e));
    }

    function handleRecieveCall(incoming) {
        peer = createPeer()
        const desc = new RTCSessionDescription(incoming.sdp);
        peer.setRemoteDescription(desc).then(() => {
            userStream.getTracks().forEach(track => peer.addTrack(track, userStream));
        }).then(() => {
            return peer.createAnswer();
        }).then(answer => {
            return peer.setLocalDescription(answer);
        }).then(() => {
            const payload = {
                target: incoming.caller,
                caller: socket.id,
                sdp: peer.localDescription
            }
            socket.emit("answer", payload);
        })
    }

    function handleAnswer(message) {
        const desc = new RTCSessionDescription(message.sdp);
        peer.setRemoteDescription(desc).catch(e => console.log(e));
    }

    function handleICECandidateEvent(e) {
        if (e.candidate) {
            const payload = {
                target: otherUser,
                candidate: e.candidate,
            }
            socket.emit("ice-candidate", payload);
        }
    }

    function handleNewICECandidateMsg(incoming) {
        const candidate = new RTCIceCandidate(incoming);

        peer.addIceCandidate(candidate)
            .catch(e => console.log(e));
    }

    function handleTrackEvent(e) {
        partnerVideo.current.srcObject = e.streams[0];
    };

    return (
        <div>
            <video autoPlay ref={userVideo} />
            <video autoPlay ref={partnerVideo} />
        </div>
    );
};

export default Room;
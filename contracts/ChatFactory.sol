// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title ChatSession
 * @dev Lightweight disposable contract for maximum privacy with auto-expiry
 */
contract ChatSession {
    address public immutable participant1;
    address public immutable participant2;
    uint256 public messageCount;
    bool public sessionActive;
    uint256 public createdAt;
    uint256 public lastActivity;
    uint256 public sessionExpiry;
    
    // Session duration (1 hour = 3600 seconds)
    uint256 public constant SESSION_DURATION = 3600;
    
    event MessageSent(
        address indexed from,
        string cid,
        uint256 timestamp,
        uint256 expiry,
        uint256 messageIndex,
        bool isMedia,
        string messageType
    );
    
    event SessionClosed(address closedBy, uint256 timestamp);
    event SessionExpired(uint256 timestamp); 
    
    modifier onlyParticipants() {
        require(
            msg.sender == participant1 || msg.sender == participant2,
            "Unauthorized: not a participant"
        );
        _;
    }
    
    modifier sessionMustBeActive() {
        require(sessionActive, "Session closed");
        require(block.timestamp < sessionExpiry, "Session expired");
        _;
    }
    
    constructor(address _participant1, address _participant2) {
        require(_participant1 != address(0) && _participant2 != address(0), "Invalid participants");
        require(_participant1 != _participant2, "Participants must differ");
        
        participant1 = _participant1;
        participant2 = _participant2;
        sessionActive = true;
        createdAt = block.timestamp;
        lastActivity = block.timestamp;
        sessionExpiry = block.timestamp + SESSION_DURATION;
    }
    
    function sendMessage(
        string calldata cid,
        uint256 expiry,
        bool isMedia,
        string calldata messageType
    ) external onlyParticipants sessionMustBeActive {
        require(bytes(cid).length > 0, "CID required");
        require(bytes(messageType).length > 0, "Message type required");
        
        if (expiry > 0) {
            require(expiry > block.timestamp, "Invalid expiry");
        }
        
        lastActivity = block.timestamp;
        
        emit MessageSent(
            msg.sender,
            cid,
            block.timestamp,
            expiry,
            messageCount++,
            isMedia,
            messageType
        );
    }
    
    function closeSession() external onlyParticipants {
        sessionActive = false;
        emit SessionClosed(msg.sender, block.timestamp);
    }
    
    function isSessionExpired() external view returns (bool) {
        return block.timestamp >= sessionExpiry;
    }
    
    function getRemainingTime() external view returns (uint256) {
        if (block.timestamp >= sessionExpiry) {
            return 0;
        }
        return sessionExpiry - block.timestamp;
    }
    
    function forceExpireSession() external {
        require(block.timestamp >= sessionExpiry, "Session not yet expired");
        require(sessionActive, "Session already closed");
        
        sessionActive = false;
        emit SessionExpired(block.timestamp);
    }
    
    function getSessionInfo() 
        external 
        view 
        returns (
            address p1,
            address p2,
            uint256 messages,
            bool active,
            uint256 created,
            uint256 lastMsg,
            uint256 expiry,
            uint256 remaining
        ) 
    {
        uint256 timeLeft = 0;
        if (block.timestamp < sessionExpiry) {
            timeLeft = sessionExpiry - block.timestamp;
        }
        
        return (
            participant1, 
            participant2, 
            messageCount, 
            sessionActive && (block.timestamp < sessionExpiry), 
            createdAt, 
            lastActivity,
            sessionExpiry,
            timeLeft
        );
    }
}

/**
 * @title ChatFactory
 * @dev Factory for creating disposable chat sessions with auto-expiry
 */
contract ChatFactory {
    event ChatSessionCreated(
        address indexed sessionContract,
        address indexed initiator,
        address indexed participant,
        bytes32 sessionId,
        uint256 timestamp,
        uint256 expiryTime
    );
    
    event SessionClosed(
        bytes32 indexed sessionId,
        address indexed closedBy,
        uint256 timestamp
    );
    
    event SessionExpired(
        bytes32 indexed sessionId,
        uint256 timestamp
    );
    
    // Mappings
    mapping(bytes32 => address) public sessionContracts;
    mapping(address => bytes32[]) public userSessions;
    mapping(address => mapping(address => bytes32)) public participantPairToSession;
    
    // Statistics
    uint256 public totalSessions;
    uint256 public activeSessions;
    
    // Session limits
    uint256 public constant MAX_SESSIONS_PER_USER = 100;
    
    /**
     * @dev Create new private chat session with expiry handling
     */
    function createChatSession(
        address participant
    ) external returns (address sessionContract, bytes32 sessionId) {
        require(participant != address(0), "Invalid participant");
        require(participant != msg.sender, "Cannot session with yourself");
        require(
            userSessions[msg.sender].length < MAX_SESSIONS_PER_USER,
            "Maximum sessions reached"
        );
        
        sessionId = keccak256(
            abi.encodePacked(
                msg.sender,
                participant,
                block.timestamp,
                block.prevrandao,     
                totalSessions
            )
        );
            
        require(sessionContracts[sessionId] == address(0), "Session collision");
        
        // Check if existing session is expired and allow new creation
        bytes32 existingSessionId = participantPairToSession[msg.sender][participant];
        if (existingSessionId != bytes32(0)) {
            address existingContract = sessionContracts[existingSessionId];
            if (existingContract != address(0)) {
                ChatSession existing = ChatSession(existingContract);
                
                // Allow new session if old one is expired OR inactive
                bool isExpired = existing.isSessionExpired();
                bool isActive = existing.sessionActive();
                
                if (isActive && !isExpired) {
                    revert("Active session exists");
                }
                
                // If session is expired but still marked active, update statistics
                if (isExpired && isActive) {
                    activeSessions--;
                }
            }
        }
        
        ChatSession newSession = new ChatSession{
            salt: sessionId
        }(msg.sender, participant);
        
        sessionContract = address(newSession);
        
        // Update mappings (overwrite old expired session)
        sessionContracts[sessionId] = sessionContract;
        userSessions[msg.sender].push(sessionId);
        userSessions[participant].push(sessionId);
        participantPairToSession[msg.sender][participant] = sessionId;
        participantPairToSession[participant][msg.sender] = sessionId;
        
        // Update counters
        totalSessions++;
        activeSessions++;
        
        // Get session expiry time
        (, , , , , , uint256 expiryTime, ) = newSession.getSessionInfo();
        
        emit ChatSessionCreated(
            sessionContract,
            msg.sender,
            participant,
            sessionId,
            block.timestamp,
            expiryTime
        );
        
        return (sessionContract, sessionId);
    }
    
    function getSessionContract(bytes32 sessionId) external view returns (address) {
        return sessionContracts[sessionId];
    }
    
    function getUserSessions(address user) external view returns (bytes32[] memory) {
        return userSessions[user];
    }
    
    /**
     * @dev Get active session between two users with expiry check
     */
    function getSessionBetween(
        address user1,
        address user2
    ) external view returns (bytes32 sessionId, address contractAddr, bool isActive) {
        sessionId = participantPairToSession[user1][user2];
        contractAddr = sessionContracts[sessionId];
        
        if (contractAddr != address(0)) {
            ChatSession session = ChatSession(contractAddr);
            bool manuallyActive = session.sessionActive();
            bool notExpired = !session.isSessionExpired();
            isActive = manuallyActive && notExpired;
        }
        
        return (sessionId, contractAddr, isActive);
    }
    
    /**
     * @dev Clean up expired sessions
     */
    function cleanupExpiredSessions(bytes32[] calldata sessionIds) external {
        for (uint256 i = 0; i < sessionIds.length; i++) {
            address sessionAddr = sessionContracts[sessionIds[i]];
            if (sessionAddr != address(0)) {
                ChatSession session = ChatSession(sessionAddr);
                
                if (session.isSessionExpired() && session.sessionActive()) {
                    session.forceExpireSession();
                    activeSessions--;
                    
                    emit SessionExpired(sessionIds[i], block.timestamp);
                }
            }
        }
    }
    
    function getFactoryStats() 
        external 
        view 
        returns (uint256 total, uint256 active) 
    {
        return (totalSessions, activeSessions);
    }
    
    function estimateSessionCreationGas() external pure returns (uint256) {
        return 350000;
    }
    
    /**
     * @dev Get all active (non-expired) sessions for a user
     */
    function getActiveUserSessions(address user) external view returns (bytes32[] memory activeSessions_) {
        bytes32[] memory allSessions = userSessions[user];
        uint256 activeCount = 0;
        
        // Count active sessions
        for (uint256 i = 0; i < allSessions.length; i++) {
            address sessionAddr = sessionContracts[allSessions[i]];
            if (sessionAddr != address(0)) {
                ChatSession session = ChatSession(sessionAddr);
                if (session.sessionActive() && !session.isSessionExpired()) {
                    activeCount++;
                }
            }
        }
        
        // Build active sessions array
        activeSessions_ = new bytes32[](activeCount);
        uint256 index = 0;
        
        for (uint256 i = 0; i < allSessions.length; i++) {
            address sessionAddr = sessionContracts[allSessions[i]];
            if (sessionAddr != address(0)) {
                ChatSession session = ChatSession(sessionAddr);
                if (session.sessionActive() && !session.isSessionExpired()) {
                    activeSessions_[index] = allSessions[i];
                    index++;
                }
            }
        }
        
        return activeSessions_;
    }
}

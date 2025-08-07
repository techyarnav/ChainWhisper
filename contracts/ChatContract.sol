// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title ChatContract
 * @dev Main contract for encrypted messaging with manual IPFS CID support
 */
contract ChatContract {
    event MessageSent(
        address indexed from,
        address indexed to,
        string cid,
        uint256 timestamp,
        uint256 expiry,
        uint256 messageId,
        bytes32 indexed conversationHash
    );
    
    event MessageReaction(
        uint256 indexed messageId,
        address indexed reactor,
        string reaction,
        uint256 timestamp
    );
    
    uint256 private messageCounter;
    mapping(uint256 => MessageData) public messages;
    mapping(address => uint256[]) public userMessages;
    mapping(bytes32 => uint256[]) public conversationMessages;
    
    struct MessageData {
        address from;
        address to;
        string cid;
        uint256 timestamp;
        uint256 expiry;
        bool isMedia;
        string messageType;
        bytes32 conversationHash;
    }
    
    struct MessageStats {
        uint128 totalMessages;
        uint128 activeConversations;
    }
    
    MessageStats public stats;
    
    function sendMessage(
        address to,
        string calldata cid,
        uint256 expiry,
        bool isMedia,
        string calldata messageType
    ) external returns (uint256 messageId) {
        require(to != address(0), "Invalid recipient");
        require(to != msg.sender, "Cannot message yourself");
        require(bytes(cid).length > 0, "CID required");
        require(bytes(messageType).length > 0, "Message type required");
        
        // Validate expiry if set
        if (expiry > 0) {
            require(expiry > block.timestamp, "Expiry must be in future");
            require(expiry <= block.timestamp + 365 days, "Expiry too far");
        }
        
        messageId = messageCounter++;
        
        // Generate conversation hash for grouping
        bytes32 conversationHash = generateConversationHash(msg.sender, to);
        
        messages[messageId] = MessageData({
            from: msg.sender,
            to: to,
            cid: cid,
            timestamp: block.timestamp,
            expiry: expiry,
            isMedia: isMedia,
            messageType: messageType,
            conversationHash: conversationHash
        });
        
        // Update indexes
        userMessages[msg.sender].push(messageId);
        userMessages[to].push(messageId);
        conversationMessages[conversationHash].push(messageId);
        
        // Update stats
        stats.totalMessages++;
        
        emit MessageSent(
            msg.sender,
            to,
            cid,
            block.timestamp,
            expiry,
            messageId,
            conversationHash
        );
        
        return messageId;
    }
    
    function addReaction(uint256 messageId, string calldata reaction) external {
        require(messageId < messageCounter, "Message not found");
        require(bytes(reaction).length > 0, "Reaction required");
        
        MessageData memory message = messages[messageId];
        require(
            message.from == msg.sender || message.to == msg.sender,
            "Not authorized to react"
        );
        
        emit MessageReaction(messageId, msg.sender, reaction, block.timestamp);
    }
    
    /**
     * @dev Generate deterministic conversation hash for two participants
     */
    function generateConversationHash(address user1, address user2) 
        public 
        pure 
        returns (bytes32) 
    {
        // Ensure consistent ordering
        if (user1 > user2) {
            (user1, user2) = (user2, user1);
        }
        return keccak256(abi.encodePacked(user1, user2));
    }
    
    /**
     * @dev Get conversation hash between current user and another
     */
    function getConversationHash(address otherUser) external view returns (bytes32) {
        return generateConversationHash(msg.sender, otherUser);
    }
    
    /**
     * @dev Get all message IDs in a conversation
     */
    function getConversationMessages(bytes32 conversationHash) 
        external 
        view 
        returns (uint256[] memory) 
    {
        return conversationMessages[conversationHash];
    }
    
    /**
     * @dev Get user's message IDs
     */
    function getUserMessages(address user) external view returns (uint256[] memory) {
        return userMessages[user];
    }
    
    /**
     * @dev Get message details
     */
    function getMessage(uint256 messageId) 
        external 
        view 
        returns (MessageData memory) 
    {
        require(messageId < messageCounter, "Message not found");
        return messages[messageId];
    }
    
    /**
     * @dev Check if message is expired
     */
    function isExpired(uint256 messageId) external view returns (bool) {
        require(messageId < messageCounter, "Message not found");
        MessageData memory message = messages[messageId];
        
        if (message.expiry == 0) return false;
        return block.timestamp > message.expiry;
    }
    
    /**
     * @dev Get contract statistics
     */
    function getStats() external view returns (uint256 totalMessages, uint256 totalUsers) {
        return (stats.totalMessages, messageCounter);
    }
    
    /**
     * @dev Get recent messages for a user (last 50)
     */
    function getRecentMessages(address user) 
        external 
        view 
        returns (uint256[] memory recentIds) 
    {
        uint256[] memory allMessages = userMessages[user];
        uint256 totalMessages = allMessages.length;
        
        if (totalMessages == 0) {
            return new uint256[](0);
        }
        
        uint256 returnCount = totalMessages > 50 ? 50 : totalMessages;
        recentIds = new uint256[](returnCount);
        
        for (uint256 i = 0; i < returnCount; i++) {
            recentIds[i] = allMessages[totalMessages - 1 - i];
        }
        
        return recentIds;
    }
}

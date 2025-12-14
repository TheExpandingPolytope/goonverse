/**
 * Shared type definitions
 */
/**
 * Convert an ExitTicket to serializable format
 */
export function serializeExitTicket(ticket) {
    return {
        serverId: ticket.serverId,
        sessionId: ticket.sessionId,
        player: ticket.player,
        payout: ticket.payout.toString(),
        deadline: ticket.deadline.toString(),
        signature: ticket.signature,
    };
}
/**
 * Convert a serialized ticket back to ExitTicket
 */
export function deserializeExitTicket(ticket) {
    return {
        serverId: ticket.serverId,
        sessionId: ticket.sessionId,
        player: ticket.player,
        payout: BigInt(ticket.payout),
        deadline: BigInt(ticket.deadline),
        signature: ticket.signature,
    };
}

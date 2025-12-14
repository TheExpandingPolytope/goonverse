export declare const config: {
    readonly port: number;
    readonly nodeEnv: string;
    readonly redisUri: string;
    readonly privyAppId: string;
    readonly privyAppSecret: string;
    readonly ponderUrl: string;
    readonly serverId: `0x${string}`;
    readonly controllerPrivateKey: `0x${string}`;
    readonly worldContractAddress: `0x${string}`;
    readonly exitTicketTtlSeconds: number;
    readonly region: string;
    readonly maxClients: number;
};
export type Config = typeof config;

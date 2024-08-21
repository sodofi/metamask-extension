import {
  NetworkMetadata,
  NetworkState,
  NetworkStatus,
  RpcEndpointType,
} from '@metamask/network-controller';
import { v4 as uuidv4 } from 'uuid';
import { Hex } from '@metamask/utils';
import {
  NETWORK_TO_NAME_MAP,
  CHAIN_ID_TO_CURRENCY_SYMBOL_MAP,
} from '../../shared/constants/network';

export const mockNetworkState = (
  ...networks: {
    // id?: string;
    // type?: string;
    chainId: Hex;
    rpcUrl?: string;
    nickname?: string;
    ticker?: string;
    blockExplorerUrl?: string;
    metadata?: NetworkMetadata;
  }[]
): NetworkState => {
  if (
    new Set(networks.map((network) => network.chainId)).size !== networks.length
  ) {
    // todo support multiple rpc urls per chain ids by grouping them
    throw 'TODO: mockNetworkState doesnt yet support multiple rpc urls per chain id';
  }

  const networkConfigurations = networks.map((network) => {
    const blockExplorer =
      !('blockExplorerUrl' in network) || network.blockExplorerUrl
        ? network.blockExplorerUrl ??
          `https://localhost/blockExplorer/${network.chainId}`
        : undefined;

    const rpc =
      'rpcUrl' in network
        ? network.rpcUrl
        : `https://localhost/rpc/${network.chainId}`;

    return {
      chainId: network.chainId,
      blockExplorerUrls: blockExplorer ? [blockExplorer] : [],
      defaultBlockExplorerUrlIndex: blockExplorer ? 0 : undefined,
      rpcEndpoints: [
        { networkClientId: uuidv4(), type: RpcEndpointType.Custom, url: rpc },
      ],
      defaultRpcEndpointIndex: 0,
      name:
        'nickname' in network
          ? network.nickname
          : (NETWORK_TO_NAME_MAP as Record<Hex, string>)[network.chainId],
      nativeCurrency:
        'ticker' in network
          ? network.ticker
          : (CHAIN_ID_TO_CURRENCY_SYMBOL_MAP as Record<Hex, string>)[
              network.chainId
            ],
    };
  });

  const networksMetadata = networks.reduce(
    (acc, network, i) => ({
      ...acc,
      [networkConfigurations[i].rpcEndpoints[0].networkClientId]:
        network.metadata ?? {
          EIPS: {},
          status: NetworkStatus.Available,
        },
    }),
    {},
  );

  const z = {
    selectedNetworkClientId:
      networkConfigurations[0].rpcEndpoints[0].networkClientId,
    networkConfigurationsByChainId: networkConfigurations.reduce(
      (acc, network) => ({ ...acc, [network.chainId]: network }),
      {},
    ),
    networksMetadata,
  };

  console.dir(z, { depth: null });
  return z;
};
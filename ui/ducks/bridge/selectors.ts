import {
  NetworkConfiguration,
  NetworkState,
} from '@metamask/network-controller';
import { orderBy, uniqBy } from 'lodash';
import { createSelector } from 'reselect';
import { GasFeeEstimates } from '@metamask/gas-fee-controller';
import { BigNumber } from 'bignumber.js';
import { calcTokenAmount } from '@metamask/notification-services-controller/push-services';
import {
  getIsBridgeEnabled,
  getMarketData,
  getUSDConversionRate,
  getUSDConversionRateByChainId,
  selectConversionRateByChainId,
} from '../../selectors/selectors';
import {
  ALLOWED_BRIDGE_CHAIN_IDS,
  BRIDGE_PREFERRED_GAS_ESTIMATE,
  BRIDGE_QUOTE_MAX_ETA_SECONDS,
  BRIDGE_QUOTE_MAX_RETURN_DIFFERENCE_PERCENTAGE,
} from '../../../shared/constants/bridge';
import {
  BridgeControllerState,
  BridgeFeatureFlagsKey,
  // TODO: Remove restricted import
  // eslint-disable-next-line import/no-restricted-paths
} from '../../../app/scripts/controllers/bridge/types';
import { createDeepEqualSelector } from '../../../shared/modules/selectors/util';
import { SWAPS_CHAINID_DEFAULT_TOKEN_MAP } from '../../../shared/constants/swaps';
import {
  getProviderConfig,
  getNetworkConfigurationsByChainId,
} from '../../../shared/modules/selectors/networks';
import { getConversionRate, getGasFeeEstimates } from '../metamask/metamask';
// TODO: Remove restricted import
// eslint-disable-next-line import/no-restricted-paths
import { RequestStatus } from '../../../app/scripts/controllers/bridge/constants';
import {
  L1GasFees,
  BridgeToken,
  QuoteMetadata,
  QuoteResponse,
  SortOrder,
} from '../../pages/bridge/types';
import {
  calcAdjustedReturn,
  calcCost,
  calcRelayerFee,
  calcSentAmount,
  calcSwapRate,
  calcToAmount,
  calcTotalGasFee,
  isNativeAddress,
} from '../../pages/bridge/utils/quote';
import { decGWEIToHexWEI } from '../../../shared/modules/conversion.utils';
import {
  exchangeRatesFromNativeAndCurrencyRates,
  exchangeRateFromMarketData,
  tokenPriceInNativeAsset,
} from './utils';
import { BridgeState } from './bridge';

type BridgeAppState = {
  metamask: { bridgeState: BridgeControllerState } & NetworkState & {
      useExternalServices: boolean;
      currencyRates: {
        [currency: string]: {
          conversionRate: number;
          usdConversionRate?: number;
        };
      };
    };
  bridge: BridgeState;
};

// only includes networks user has added
export const getAllBridgeableNetworks = createDeepEqualSelector(
  getNetworkConfigurationsByChainId,
  (networkConfigurationsByChainId) => {
    return uniqBy(
      Object.values(networkConfigurationsByChainId),
      'chainId',
    ).filter(({ chainId }) =>
      ALLOWED_BRIDGE_CHAIN_IDS.includes(
        chainId as (typeof ALLOWED_BRIDGE_CHAIN_IDS)[number],
      ),
    );
  },
);

export const getFromChains = createDeepEqualSelector(
  getAllBridgeableNetworks,
  (state: BridgeAppState) => state.metamask.bridgeState?.bridgeFeatureFlags,
  (allBridgeableNetworks, bridgeFeatureFlags) =>
    allBridgeableNetworks.filter(({ chainId }) =>
      bridgeFeatureFlags[BridgeFeatureFlagsKey.NETWORK_SRC_ALLOWLIST].includes(
        chainId,
      ),
    ),
);

export const getFromChain = createDeepEqualSelector(
  getNetworkConfigurationsByChainId,
  getProviderConfig,
  (
    networkConfigurationsByChainId,
    providerConfig,
  ): NetworkConfiguration | undefined =>
    providerConfig?.chainId
      ? networkConfigurationsByChainId[providerConfig.chainId]
      : undefined,
);

export const getToChains = createDeepEqualSelector(
  getAllBridgeableNetworks,
  (state: BridgeAppState) => state.metamask.bridgeState?.bridgeFeatureFlags,
  (allBridgeableNetworks, bridgeFeatureFlags): NetworkConfiguration[] =>
    allBridgeableNetworks.filter(({ chainId }) =>
      bridgeFeatureFlags[BridgeFeatureFlagsKey.NETWORK_DEST_ALLOWLIST].includes(
        chainId,
      ),
    ),
);

export const getToChain = createDeepEqualSelector(
  getToChains,
  (state: BridgeAppState) => state.bridge.toChainId,
  (toChains, toChainId): NetworkConfiguration | undefined =>
    toChains.find(({ chainId }) => chainId === toChainId),
);

export const getFromTokens = createDeepEqualSelector(
  (state: BridgeAppState) => state.metamask.bridgeState.srcTokens,
  (state: BridgeAppState) => state.metamask.bridgeState.srcTopAssets,
  (state: BridgeAppState) =>
    state.metamask.bridgeState.srcTokensLoadingStatus === RequestStatus.LOADING,
  (fromTokens, fromTopAssets, isLoading) => {
    return {
      isLoading,
      fromTokens: fromTokens ?? {},
      fromTopAssets: fromTopAssets ?? [],
    };
  },
);

export const getToTokens = createDeepEqualSelector(
  (state: BridgeAppState) => state.metamask.bridgeState.destTokens,
  (state: BridgeAppState) => state.metamask.bridgeState.destTopAssets,
  (state: BridgeAppState) =>
    state.metamask.bridgeState.destTokensLoadingStatus ===
    RequestStatus.LOADING,
  (toTokens, toTopAssets, isLoading) => {
    return {
      isLoading,
      toTokens: toTokens ?? {},
      toTopAssets: toTopAssets ?? [],
    };
  },
);

export const getFromToken = createSelector(
  (state: BridgeAppState) => state.bridge.fromToken,
  getFromChain,
  (fromToken, fromChain): BridgeToken | null => {
    if (!fromChain?.chainId) {
      return null;
    }
    return fromToken?.address
      ? fromToken
      : SWAPS_CHAINID_DEFAULT_TOKEN_MAP[
          fromChain.chainId as keyof typeof SWAPS_CHAINID_DEFAULT_TOKEN_MAP
        ];
  },
);

export const getToToken = (state: BridgeAppState): BridgeToken | null => {
  return state.bridge.toToken;
};

export const getFromAmount = (state: BridgeAppState): string | null =>
  state.bridge.fromTokenInputValue;

export const getQuoteRequest = (state: BridgeAppState) => {
  const { quoteRequest } = state.metamask.bridgeState;
  return quoteRequest;
};

export const getBridgeQuotesConfig = (state: BridgeAppState) =>
  state.metamask.bridgeState?.bridgeFeatureFlags[
    BridgeFeatureFlagsKey.EXTENSION_CONFIG
  ] ?? {};

const _getBridgeFeesPerGas = createSelector(
  getGasFeeEstimates,
  (gasFeeEstimates) => ({
    estimatedBaseFeeInDecGwei: (gasFeeEstimates as GasFeeEstimates)
      ?.estimatedBaseFee,
    maxPriorityFeePerGasInDecGwei: (gasFeeEstimates as GasFeeEstimates)?.[
      BRIDGE_PREFERRED_GAS_ESTIMATE
    ]?.suggestedMaxPriorityFeePerGas,
    maxFeePerGas: decGWEIToHexWEI(
      (gasFeeEstimates as GasFeeEstimates)?.high?.suggestedMaxFeePerGas,
    ),
    maxPriorityFeePerGas: decGWEIToHexWEI(
      (gasFeeEstimates as GasFeeEstimates)?.high?.suggestedMaxPriorityFeePerGas,
    ),
  }),
);

export const getBridgeSortOrder = (state: BridgeAppState) =>
  state.bridge.sortOrder;

export const getFromTokenConversionRate = createSelector(
  getFromChain,
  getMarketData,
  getFromToken,
  getUSDConversionRate,
  getConversionRate,
  (state) => state.bridge.fromTokenExchangeRate,
  (
    fromChain,
    marketData,
    fromToken,
    nativeToUsdRate,
    nativeToCurrencyRate,
    fromTokenExchangeRate,
  ) => {
    if (fromChain?.chainId && fromToken && marketData) {
      const tokenToNativeAssetRate =
        exchangeRateFromMarketData(
          fromChain.chainId,
          fromToken.address,
          marketData,
        ) ??
        tokenPriceInNativeAsset(fromTokenExchangeRate, nativeToCurrencyRate);

      return exchangeRatesFromNativeAndCurrencyRates(
        tokenToNativeAssetRate,
        nativeToCurrencyRate,
        nativeToUsdRate,
      );
    }
    return exchangeRatesFromNativeAndCurrencyRates();
  },
);

// A dest network can be selected before it's imported
// The cached exchange rate won't be available so the rate from the bridge state is used
export const getToTokenConversionRate = createDeepEqualSelector(
  getToChain,
  getMarketData,
  getToToken,
  (state) => ({
    state,
    toTokenExchangeRate: state.bridge.toTokenExchangeRate,
  }),
  (toChain, marketData, toToken, { state, toTokenExchangeRate }) => {
    if (toChain?.chainId && toToken && marketData) {
      const { chainId } = toChain;

      const nativeToCurrencyRate = selectConversionRateByChainId(
        state,
        chainId,
      );
      const nativeToUsdRate = getUSDConversionRateByChainId(chainId)(state);
      const tokenToNativeAssetRate =
        exchangeRateFromMarketData(chainId, toToken.address, marketData) ??
        tokenPriceInNativeAsset(toTokenExchangeRate, nativeToCurrencyRate);
      return exchangeRatesFromNativeAndCurrencyRates(
        tokenToNativeAssetRate,
        nativeToCurrencyRate,
        nativeToUsdRate,
      );
    }
    return exchangeRatesFromNativeAndCurrencyRates();
  },
);

const _getQuotesWithMetadata = createDeepEqualSelector(
  (state) => state.metamask.bridgeState.quotes,
  getToTokenConversionRate,
  getFromTokenConversionRate,
  getConversionRate,
  _getBridgeFeesPerGas,
  (
    quotes,
    toTokenExchangeRate,
    fromTokenExchangeRate,
    nativeExchangeRate,
    { estimatedBaseFeeInDecGwei, maxPriorityFeePerGasInDecGwei },
  ): (QuoteResponse & QuoteMetadata)[] => {
    const newQuotes = quotes.map((quote: QuoteResponse) => {
      const toTokenAmount = calcToAmount(
        quote.quote,
        toTokenExchangeRate.valueInCurrency,
      );
      const gasFee = calcTotalGasFee(
        quote,
        estimatedBaseFeeInDecGwei,
        maxPriorityFeePerGasInDecGwei,
        nativeExchangeRate,
      );
      const relayerFee = calcRelayerFee(quote, nativeExchangeRate);
      const totalNetworkFee = {
        amount: gasFee.amount.plus(relayerFee.amount),
        valueInCurrency:
          gasFee.valueInCurrency?.plus(relayerFee.valueInCurrency || '0') ??
          null,
      };
      const sentAmount = calcSentAmount(
        quote.quote,
        fromTokenExchangeRate.valueInCurrency,
      );
      const adjustedReturn = calcAdjustedReturn(
        toTokenAmount.valueInCurrency,
        totalNetworkFee.valueInCurrency,
      );

      return {
        ...quote,
        toTokenAmount,
        sentAmount,
        totalNetworkFee,
        adjustedReturn,
        gasFee,
        swapRate: calcSwapRate(sentAmount.amount, toTokenAmount.amount),
        cost: calcCost(
          adjustedReturn.valueInCurrency,
          sentAmount.valueInCurrency,
        ),
      };
    });

    return newQuotes;
  },
);

const _getSortedQuotesWithMetadata = createDeepEqualSelector(
  _getQuotesWithMetadata,
  getBridgeSortOrder,
  (quotesWithMetadata, sortOrder) => {
    switch (sortOrder) {
      case SortOrder.ETA_ASC:
        return orderBy(
          quotesWithMetadata,
          (quote) => quote.estimatedProcessingTimeInSeconds,
          'asc',
        );
      case SortOrder.COST_ASC:
      default:
        return orderBy(
          quotesWithMetadata,
          ({ cost }) => cost.valueInCurrency,
          'asc',
        );
    }
  },
);

const _getRecommendedQuote = createDeepEqualSelector(
  _getSortedQuotesWithMetadata,
  getBridgeSortOrder,
  (sortedQuotesWithMetadata, sortOrder) => {
    if (!sortedQuotesWithMetadata.length) {
      return undefined;
    }

    const bestReturnValue = BigNumber.max(
      sortedQuotesWithMetadata.map(
        ({ adjustedReturn }) => adjustedReturn.valueInCurrency ?? 0,
      ),
    );

    const isFastestQuoteValueReasonable = (
      adjustedReturnInCurrency: BigNumber | null,
    ) =>
      adjustedReturnInCurrency
        ? adjustedReturnInCurrency
            .div(bestReturnValue)
            .gte(BRIDGE_QUOTE_MAX_RETURN_DIFFERENCE_PERCENTAGE)
        : true;

    const isBestPricedQuoteETAReasonable = (
      estimatedProcessingTimeInSeconds: number,
    ) => estimatedProcessingTimeInSeconds < BRIDGE_QUOTE_MAX_ETA_SECONDS;

    return (
      sortedQuotesWithMetadata.find((quote) => {
        return sortOrder === SortOrder.ETA_ASC
          ? isFastestQuoteValueReasonable(quote.adjustedReturn.valueInCurrency)
          : isBestPricedQuoteETAReasonable(
              quote.estimatedProcessingTimeInSeconds,
            );
      }) ?? sortedQuotesWithMetadata[0]
    );
  },
);

// Generates a pseudo-unique string that identifies each quote
// by aggregator, bridge, steps and value
const _getQuoteIdentifier = ({ quote }: QuoteResponse & L1GasFees) =>
  `${quote.bridgeId}-${quote.bridges[0]}-${quote.steps.length}`;

const _getSelectedQuote = createSelector(
  (state: BridgeAppState) => state.metamask.bridgeState.quotesRefreshCount,
  (state: BridgeAppState) => state.bridge.selectedQuote,
  _getSortedQuotesWithMetadata,
  (quotesRefreshCount, selectedQuote, sortedQuotesWithMetadata) =>
    quotesRefreshCount <= 1
      ? selectedQuote
      : // Find match for selectedQuote in new quotes
        sortedQuotesWithMetadata.find((quote) =>
          selectedQuote
            ? _getQuoteIdentifier(quote) === _getQuoteIdentifier(selectedQuote)
            : false,
        ),
);

export const getBridgeQuotes = createSelector(
  _getSortedQuotesWithMetadata,
  _getRecommendedQuote,
  _getSelectedQuote,
  (state) => state.metamask.bridgeState.quotesLastFetched,
  (state) =>
    state.metamask.bridgeState.quotesLoadingStatus === RequestStatus.LOADING,
  (state: BridgeAppState) => state.metamask.bridgeState.quotesRefreshCount,
  (state: BridgeAppState) => state.metamask.bridgeState.quotesInitialLoadTime,
  (state: BridgeAppState) => state.metamask.bridgeState.quoteFetchError,
  getBridgeQuotesConfig,
  getQuoteRequest,
  (
    sortedQuotesWithMetadata,
    recommendedQuote,
    selectedQuote,
    quotesLastFetchedMs,
    isLoading,
    quotesRefreshCount,
    quotesInitialLoadTimeMs,
    quoteFetchError,
    { maxRefreshCount },
    { insufficientBal },
  ) => ({
    sortedQuotes: sortedQuotesWithMetadata,
    recommendedQuote,
    activeQuote: selectedQuote ?? recommendedQuote,
    quotesLastFetchedMs,
    isLoading,
    quoteFetchError,
    quotesRefreshCount,
    quotesInitialLoadTimeMs,
    isQuoteGoingToRefresh: insufficientBal
      ? false
      : quotesRefreshCount < maxRefreshCount,
  }),
);

export const getSlippage = (state: BridgeAppState) => state.bridge.slippage;

export const getIsBridgeTx = createDeepEqualSelector(
  getFromChain,
  getToChain,
  (state: BridgeAppState) => getIsBridgeEnabled(state),
  (fromChain, toChain, isBridgeEnabled: boolean) =>
    isBridgeEnabled && toChain && fromChain?.chainId
      ? fromChain.chainId !== toChain.chainId
      : false,
);

const _getValidatedSrcAmount = createSelector(
  getFromToken,
  (state: BridgeAppState) =>
    state.metamask.bridgeState.quoteRequest.srcTokenAmount,
  (fromToken, srcTokenAmount) =>
    srcTokenAmount && fromToken?.decimals
      ? calcTokenAmount(srcTokenAmount, Number(fromToken.decimals)).toString()
      : null,
);

export const getFromAmountInCurrency = createSelector(
  getFromToken,
  getFromChain,
  _getValidatedSrcAmount,
  getFromTokenConversionRate,
  (
    fromToken,
    fromChain,
    validatedSrcAmount,
    { valueInCurrency: fromTokenToCurrencyExchangeRate },
  ) => {
    if (fromToken?.symbol && fromChain?.chainId && validatedSrcAmount) {
      if (fromTokenToCurrencyExchangeRate) {
        return new BigNumber(validatedSrcAmount).mul(
          new BigNumber(fromTokenToCurrencyExchangeRate.toString() ?? 1),
        );
      }
    }
    return new BigNumber(0);
  },
);

export const getValidationErrors = createDeepEqualSelector(
  getBridgeQuotes,
  _getValidatedSrcAmount,
  getFromToken,
  getFromAmount,
  (
    { activeQuote, quotesLastFetchedMs, isLoading },
    validatedSrcAmount,
    fromToken,
    fromTokenInputValue,
  ) => {
    return {
      isNoQuotesAvailable: Boolean(
        !activeQuote && quotesLastFetchedMs && !isLoading,
      ),
      // Shown prior to fetching quotes
      isInsufficientGasBalance: (balance?: BigNumber) => {
        if (balance && !activeQuote && validatedSrcAmount && fromToken) {
          return isNativeAddress(fromToken.address)
            ? balance.eq(validatedSrcAmount)
            : balance.lte(0);
        }
        return false;
      },
      // Shown after fetching quotes
      isInsufficientGasForQuote: (balance?: BigNumber) => {
        if (balance && activeQuote && fromToken && fromTokenInputValue) {
          return isNativeAddress(fromToken.address)
            ? balance
                .sub(activeQuote.totalNetworkFee.amount)
                .sub(activeQuote.sentAmount.amount)
                .lte(0)
            : balance.lte(activeQuote.totalNetworkFee.amount);
        }
        return false;
      },
      isInsufficientBalance: (balance?: BigNumber) =>
        validatedSrcAmount && balance !== undefined
          ? balance.lt(validatedSrcAmount)
          : false,
      isEstimatedReturnLow:
        activeQuote?.sentAmount?.valueInCurrency &&
        activeQuote?.adjustedReturn?.valueInCurrency &&
        fromTokenInputValue
          ? activeQuote.adjustedReturn.valueInCurrency.lt(
              new BigNumber(
                BRIDGE_QUOTE_MAX_RETURN_DIFFERENCE_PERCENTAGE,
              ).times(activeQuote.sentAmount.valueInCurrency),
            )
          : false,
    };
  },
);

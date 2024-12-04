import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSelector, useDispatch } from 'react-redux';
import classnames from 'classnames';
import { debounce } from 'lodash';
import { useHistory, useLocation } from 'react-router-dom';
import { BigNumber } from 'bignumber.js';
import {
  setFromChain,
  setFromToken,
  setFromTokenInputValue,
  setSelectedQuote,
  setToChain,
  setToChainId,
  setToToken,
  updateQuoteRequestParams,
  resetBridgeState,
} from '../../../ducks/bridge/actions';
import {
  getFromAmount,
  getFromChain,
  getFromChains,
  getFromToken,
  getFromTokens,
  getQuoteRequest,
  getSlippage,
  getToChain,
  getToChains,
  getToToken,
  getToTokens,
  getBridgeQuotes,
  getFromAmountInCurrency,
  getValidationErrors,
  getBridgeQuotesConfig,
} from '../../../ducks/bridge/selectors';
import {
  BannerAlert,
  BannerAlertSeverity,
  Box,
  ButtonIcon,
  IconName,
  PopoverPosition,
  Text,
} from '../../../components/component-library';
import {
  BackgroundColor,
  BlockSize,
  Display,
  FlexDirection,
  IconColor,
  JustifyContent,
  TextAlign,
  TextColor,
  TextVariant,
} from '../../../helpers/constants/design-system';
import { useI18nContext } from '../../../hooks/useI18nContext';
import {
  SWAPS_CHAINID_DEFAULT_TOKEN_MAP,
  TokenBucketPriority,
} from '../../../../shared/constants/swaps';
import { useTokensWithFiltering } from '../../../hooks/useTokensWithFiltering';
import { setActiveNetwork } from '../../../store/actions';
import { hexToDecimal } from '../../../../shared/modules/conversion.utils';
import { QuoteRequest } from '../types';
import { calcTokenValue } from '../../../../shared/lib/swaps-utils';
import { BridgeQuoteCard } from '../quotes/bridge-quote-card';
import { formatTokenAmount, isValidQuoteRequest } from '../utils/quote';
import { getProviderConfig } from '../../../../shared/modules/selectors/networks';
import {
  CrossChainSwapsEventProperties,
  useCrossChainSwapsEventTracker,
} from '../../../hooks/bridge/useCrossChainSwapsEventTracker';
import { useRequestProperties } from '../../../hooks/bridge/events/useRequestProperties';
import { MetaMetricsEventName } from '../../../../shared/constants/metametrics';
import { Footer } from '../../../components/multichain/pages/page';
import MascotBackgroundAnimation from '../../swaps/mascot-background-animation/mascot-background-animation';
import { Column, Row, Tooltip } from '../layout';
import useRamps from '../../../hooks/ramps/useRamps/useRamps';
import { getNativeCurrency } from '../../../ducks/metamask/metamask';
import useLatestBalance from '../../../hooks/bridge/useLatestBalance';
import { useCountdownTimer } from '../../../hooks/bridge/useCountdownTimer';
import { BridgeInputGroup } from './bridge-input-group';
import { BridgeCTAButton } from './bridge-cta-button';

const PrepareBridgePage = () => {
  const dispatch = useDispatch();

  const t = useI18nContext();

  const fromToken = useSelector(getFromToken);
  const {
    fromTokens,
    fromTopAssets,
    isLoading: isFromTokensLoading,
  } = useSelector(getFromTokens);

  const toToken = useSelector(getToToken);
  const {
    toTokens,
    toTopAssets,
    isLoading: isToTokensLoading,
  } = useSelector(getToTokens);

  const fromChains = useSelector(getFromChains);
  const toChains = useSelector(getToChains);
  const fromChain = useSelector(getFromChain);
  const toChain = useSelector(getToChain);

  const fromAmount = useSelector(getFromAmount);
  const fromAmountInFiat = useSelector(getFromAmountInCurrency);

  const providerConfig = useSelector(getProviderConfig);
  const slippage = useSelector(getSlippage);

  const quoteRequest = useSelector(getQuoteRequest);
  const { isLoading, activeQuote, isQuoteGoingToRefresh } =
    useSelector(getBridgeQuotes);

  const { refreshRate } = useSelector(getBridgeQuotesConfig);

  const ticker = useSelector(getNativeCurrency);
  const { isNoQuotesAvailable, isInsufficientGasForQuote } =
    useSelector(getValidationErrors);
  const { openBuyCryptoInPdapp } = useRamps();

  const { balanceAmount: nativeAssetBalance } = useLatestBalance(
    SWAPS_CHAINID_DEFAULT_TOKEN_MAP[
      fromChain?.chainId as keyof typeof SWAPS_CHAINID_DEFAULT_TOKEN_MAP
    ],
    fromChain?.chainId,
  );

  const fromTokenListGenerator = useTokensWithFiltering(
    fromTokens,
    fromTopAssets,
    TokenBucketPriority.owned,
    fromChain?.chainId,
  );
  const toTokenListGenerator = useTokensWithFiltering(
    toTokens,
    toTopAssets,
    TokenBucketPriority.top,
    toChain?.chainId,
  );

  const { flippedRequestProperties } = useRequestProperties();
  const trackCrossChainSwapsEvent = useCrossChainSwapsEventTracker();

  const millisecondsUntilNextRefresh = useCountdownTimer();

  const [rotateSwitchTokens, setRotateSwitchTokens] = useState(false);

  useEffect(() => {
    // Reset controller and inputs on load
    dispatch(resetBridgeState());
  }, []);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isInsufficientGasForQuote(nativeAssetBalance)) {
      scrollRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  }, [isInsufficientGasForQuote(nativeAssetBalance)]);

  const quoteParams = useMemo(
    () => ({
      srcTokenAddress: fromToken?.address,
      destTokenAddress: toToken?.address || undefined,
      srcTokenAmount:
        fromAmount && fromToken?.decimals
          ? calcTokenValue(
              // Treat empty or incomplete amount as 0
              ['', '.'].includes(fromAmount) ? '0' : fromAmount,
              fromToken.decimals,
            ).toFixed()
          : undefined,
      srcChainId: fromChain?.chainId
        ? Number(hexToDecimal(fromChain.chainId))
        : undefined,
      destChainId: toChain?.chainId
        ? Number(hexToDecimal(toChain.chainId))
        : undefined,
      // This override allows quotes to be returned when the rpcUrl is a tenderly fork
      // Otherwise quotes get filtered out by the bridge-api when the wallet's real
      // balance is less than the tenderly balance
      insufficientBal: Boolean(providerConfig?.rpcUrl?.includes('tenderly')),
      slippage,
    }),
    [
      fromToken,
      toToken,
      fromChain?.chainId,
      toChain?.chainId,
      fromAmount,
      providerConfig,
      slippage,
    ],
  );

  const debouncedUpdateQuoteRequestInController = useCallback(
    debounce((p: Partial<QuoteRequest>) => {
      dispatch(updateQuoteRequestParams(p));
      dispatch(setSelectedQuote(null));
    }, 300),
    [],
  );

  useEffect(() => {
    debouncedUpdateQuoteRequestInController(quoteParams);
  }, Object.values(quoteParams));

  const trackInputEvent = useCallback(
    (
      properties: CrossChainSwapsEventProperties[MetaMetricsEventName.InputChanged],
    ) => {
      trackCrossChainSwapsEvent({
        event: MetaMetricsEventName.InputChanged,
        properties,
      });
    },
    [],
  );

  const { search } = useLocation();
  const history = useHistory();

  useEffect(() => {
    if (!fromChain?.chainId || Object.keys(fromTokens).length === 0) {
      return;
    }

    const searchParams = new URLSearchParams(search);
    const tokenAddressFromUrl = searchParams.get('token');
    if (!tokenAddressFromUrl) {
      return;
    }

    const removeTokenFromUrl = () => {
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('token');
      history.replace({
        search: newParams.toString(),
      });
    };

    switch (tokenAddressFromUrl) {
      case fromToken?.address?.toLowerCase():
        // If the token is already set, remove the query param
        removeTokenFromUrl();
        break;
      case fromTokens[tokenAddressFromUrl]?.address?.toLowerCase(): {
        // If there is a matching fromToken, set it as the fromToken
        const matchedToken = fromTokens[tokenAddressFromUrl];
        dispatch(setFromToken(matchedToken));
        removeTokenFromUrl();
        break;
      }
      default:
        // Otherwise remove query param
        removeTokenFromUrl();
        break;
    }
  }, [fromChain, fromToken, fromTokens, search]);

  return (
    <Column className="prepare-bridge-page" gap={8}>
      <BridgeInputGroup
        header={t('bridgeFrom')}
        token={fromToken}
        onAmountChange={(e) => {
          dispatch(setFromTokenInputValue(e));
        }}
        onAssetChange={(token) => {
          dispatch(setFromToken(token));
          dispatch(setFromTokenInputValue(null));
          fromChain?.chainId &&
            token?.address &&
            trackInputEvent({
              input: 'token_source',
              value: token.address,
            });
          dispatch(setFromToken(token));
          dispatch(setFromTokenInputValue(null));
        }}
        networkProps={{
          network: fromChain,
          networks: fromChains,
          onNetworkChange: (networkConfig) => {
            trackInputEvent({
              input: 'chain_source',
              value: networkConfig.chainId,
            });
            if (networkConfig.chainId === toChain?.chainId) {
              dispatch(setToChainId(null));
            }
            dispatch(
              setActiveNetwork(
                networkConfig.rpcEndpoints[
                  networkConfig.defaultRpcEndpointIndex
                ].networkClientId,
              ),
            );
            dispatch(setFromChain(networkConfig.chainId));
            dispatch(setFromToken(null));
            dispatch(setFromTokenInputValue(null));
          },
          header: t('yourNetworks'),
        }}
        customTokenListGenerator={
          fromTokens && fromTopAssets ? fromTokenListGenerator : undefined
        }
        onMaxButtonClick={(value: string) => {
          dispatch(setFromTokenInputValue(value));
        }}
        amountInFiat={fromAmountInFiat}
        amountFieldProps={{
          testId: 'from-amount',
          autoFocus: true,
          value: fromAmount || undefined,
        }}
        isTokenListLoading={isFromTokensLoading}
      />

      <Column
        height={BlockSize.Full}
        paddingTop={8}
        backgroundColor={BackgroundColor.backgroundAlternativeSoft}
        style={{
          position: 'relative',
        }}
      >
        <Box
          className="prepare-bridge-page__switch-tokens"
          display={Display.Flex}
          backgroundColor={BackgroundColor.backgroundAlternativeSoft}
          style={{
            position: 'absolute',
            top: 'calc(-20px + 1px)',
            right: 'calc(50% - 20px)',
            border: '2px solid var(--color-background-default)',
            borderRadius: '100%',
            opacity: 1,
            width: 40,
            height: 40,
            justifyContent: JustifyContent.center,
          }}
        >
          <ButtonIcon
            iconProps={{
              className: classnames({
                rotate: rotateSwitchTokens,
              }),
            }}
            style={{
              alignSelf: 'center',
              borderRadius: '100%',
              width: '100%',
              height: '100%',
            }}
            data-testid="switch-tokens"
            ariaLabel="switch-tokens"
            iconName={IconName.Arrow2Down}
            color={IconColor.iconAlternativeSoft}
            disabled={!isValidQuoteRequest(quoteRequest, false)}
            onClick={() => {
              setRotateSwitchTokens(!rotateSwitchTokens);
              flippedRequestProperties &&
                trackCrossChainSwapsEvent({
                  event: MetaMetricsEventName.InputSourceDestinationFlipped,
                  properties: flippedRequestProperties,
                });
              const toChainClientId =
                toChain?.defaultRpcEndpointIndex !== undefined &&
                toChain?.rpcEndpoints
                  ? toChain.rpcEndpoints[toChain.defaultRpcEndpointIndex]
                      .networkClientId
                  : undefined;
              toChainClientId && dispatch(setActiveNetwork(toChainClientId));
              toChain && dispatch(setFromChain(toChain.chainId));
              dispatch(setFromToken(toToken));
              dispatch(setFromTokenInputValue(null));
              fromChain?.chainId && dispatch(setToChain(fromChain.chainId));
              fromChain?.chainId && dispatch(setToChainId(fromChain.chainId));
              dispatch(setToToken(fromToken));
            }}
          />
        </Box>

        <BridgeInputGroup
          header={t('swapSelectToken')}
          token={toToken}
          onAssetChange={(token) => {
            token?.address &&
              trackInputEvent({
                input: 'token_destination',
                value: token.address,
              });
            dispatch(setToToken(token));
          }}
          networkProps={{
            network: toChain,
            networks: toChains,
            onNetworkChange: (networkConfig) => {
              trackInputEvent({
                input: 'chain_destination',
                value: networkConfig.chainId,
              });
              dispatch(setToChainId(networkConfig.chainId));
              dispatch(setToChain(networkConfig.chainId));
            },
            header: t('bridgeTo'),
            shouldDisableNetwork: ({ chainId }) =>
              chainId === fromChain?.chainId,
          }}
          customTokenListGenerator={
            toChain && toTokens && toTopAssets
              ? toTokenListGenerator
              : fromTokenListGenerator
          }
          amountInFiat={
            activeQuote?.toTokenAmount?.valueInCurrency || undefined
          }
          amountFieldProps={{
            testId: 'to-amount',
            readOnly: true,
            disabled: true,
            value: activeQuote?.toTokenAmount?.amount.toFixed() ?? '0',
            autoFocus: false,
            className: activeQuote?.toTokenAmount?.amount
              ? 'amount-input defined'
              : 'amount-input',
          }}
          isTokenListLoading={isToTokensLoading}
        />
        <Column height={BlockSize.Full} justifyContent={JustifyContent.center}>
          {isLoading && !activeQuote ? (
            <>
              <Text
                textAlign={TextAlign.Center}
                color={TextColor.textAlternativeSoft}
              >
                {t('swapFetchingQuotes')}
              </Text>
              <MascotBackgroundAnimation height="64" width="64" />
            </>
          ) : null}
        </Column>

        <Row padding={6}>
          <Column
            gap={3}
            className={activeQuote ? 'highlight' : ''}
            style={{
              paddingBottom: activeQuote?.approval ? 16 : 'revert-layer',
              paddingTop: activeQuote?.approval ? 16 : undefined,
              paddingInline: 16,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {activeQuote && isQuoteGoingToRefresh && (
              <Row
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: `calc(100% * (${refreshRate} - ${millisecondsUntilNextRefresh}) / ${refreshRate})`,
                  height: 4,
                  maxWidth: '100%',
                  transition: 'width 1s linear',
                }}
                backgroundColor={BackgroundColor.primaryMuted}
              />
            )}
            <BridgeQuoteCard />
            <Footer padding={0} flexDirection={FlexDirection.Column} gap={2}>
              <BridgeCTAButton />
              {activeQuote?.approval && fromAmount && fromToken ? (
                <Row justifyContent={JustifyContent.center} gap={1}>
                  <Text
                    color={TextColor.textAlternativeSoft}
                    variant={TextVariant.bodyXs}
                    textAlign={TextAlign.Center}
                  >
                    {t('willApproveAmountForBridging', [
                      formatTokenAmount(
                        new BigNumber(fromAmount),
                        fromToken.symbol,
                      ),
                    ])}
                  </Text>
                  {fromAmount && (
                    <Tooltip
                      display={Display.InlineBlock}
                      position={PopoverPosition.Top}
                      offset={[-48, 8]}
                      title={t('grantExactAccess')}
                    >
                      {t('bridgeApprovalWarning', [
                        fromAmount,
                        fromToken.symbol,
                      ])}
                    </Tooltip>
                  )}
                </Row>
              ) : null}
            </Footer>
          </Column>
        </Row>
        {isNoQuotesAvailable && (
          <BannerAlert
            marginInline={4}
            marginBottom={10}
            severity={BannerAlertSeverity.Danger}
            description={t('noOptionsAvailableMessage')}
            textAlign={TextAlign.Left}
          />
        )}
        {!isLoading &&
          activeQuote &&
          isInsufficientGasForQuote(nativeAssetBalance) && (
            <BannerAlert
              ref={scrollRef}
              marginInline={4}
              marginBottom={3}
              title={t('bridgeValidationInsufficientGasTitle', [ticker])}
              severity={BannerAlertSeverity.Danger}
              description={t('bridgeValidationInsufficientGasMessage', [
                ticker,
              ])}
              textAlign={TextAlign.Left}
              actionButtonLabel={t('buyMoreAsset', [ticker])}
              actionButtonOnClick={() => openBuyCryptoInPdapp()}
            />
          )}
      </Column>
    </Column>
  );
};

export default PrepareBridgePage;

import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import {
  BannerAlert,
  BannerAlertSeverity,
  Text,
  PopoverPosition,
  IconName,
  ButtonLink,
  Icon,
  IconSize,
  AvatarNetwork,
  AvatarNetworkSize,
} from '../../../components/component-library';
import {
  getBridgeQuotes,
  getValidationErrors,
  getFromChain,
  getToChain,
} from '../../../ducks/bridge/selectors';
import { useI18nContext } from '../../../hooks/useI18nContext';
import {
  formatCurrencyAmount,
  formatTokenAmount,
  formatEtaInMinutes,
} from '../utils/quote';
import { getCurrentCurrency } from '../../../selectors';
import { getNativeCurrency } from '../../../ducks/metamask/metamask';
import { useCrossChainSwapsEventTracker } from '../../../hooks/bridge/useCrossChainSwapsEventTracker';
import { useRequestProperties } from '../../../hooks/bridge/events/useRequestProperties';
import { useRequestMetadataProperties } from '../../../hooks/bridge/events/useRequestMetadataProperties';
import { useQuoteProperties } from '../../../hooks/bridge/events/useQuoteProperties';
import { MetaMetricsEventName } from '../../../../shared/constants/metametrics';
import {
  AlignItems,
  BlockSize,
  JustifyContent,
  TextColor,
  TextVariant,
} from '../../../helpers/constants/design-system';
import { Row, Column, Tooltip } from '../layout';
import { BRIDGE_MM_FEE_RATE } from '../../../../shared/constants/bridge';
import {
  CHAIN_ID_TO_NETWORK_IMAGE_URL_MAP,
  NETWORK_TO_NAME_MAP,
} from '../../../../shared/constants/network';
import { decimalToPrefixedHex } from '../../../../shared/modules/conversion.utils';
import { TERMS_OF_USE_LINK } from '../../../../shared/constants/terms';
import { BridgeQuotesModal } from './bridge-quotes-modal';

export const BridgeQuoteCard = () => {
  const t = useI18nContext();
  const { isLoading, isQuoteGoingToRefresh, activeQuote } =
    useSelector(getBridgeQuotes);
  const currency = useSelector(getCurrentCurrency);
  const ticker = useSelector(getNativeCurrency);
  const { isNoQuotesAvailable, isInsufficientGasBalance } =
    useSelector(getValidationErrors);

  const currentChainId = useSelector(getCurrentChainId);

  const secondsUntilNextRefresh = useCountdownTimer();
  const { balanceAmount: nativeAssetBalance } = useLatestBalance(
    SWAPS_CHAINID_DEFAULT_TOKEN_MAP[
      currentChainId as keyof typeof SWAPS_CHAINID_DEFAULT_TOKEN_MAP
    ],
    currentChainId,
  );

  const trackCrossChainSwapsEvent = useCrossChainSwapsEventTracker();
  const { quoteRequestProperties } = useRequestProperties();
  const requestMetadataProperties = useRequestMetadataProperties();
  const quoteListProperties = useQuoteProperties();
  const { openBuyCryptoInPdapp } = useRamps();

  const fromChain = useSelector(getFromChain);
  const toChain = useSelector(getToChain);

  const [showAllQuotes, setShowAllQuotes] = useState(false);

  return (
    <>
      <BridgeQuotesModal
        isOpen={showAllQuotes}
        onClose={() => setShowAllQuotes(false)}
      />
      {activeQuote ? (
        <Column gap={3}>
          <Row justifyContent={JustifyContent.spaceBetween}>
            <Row
              gap={1}
              justifyContent={JustifyContent.flexStart}
              style={{ whiteSpace: 'nowrap' }}
            >
              <Text variant={TextVariant.bodyLgMedium}>{t('bestPrice')}</Text>
              <Tooltip
                title={t('howQuotesWork')}
                position={PopoverPosition.TopStart}
                offset={[-16, 16]}
                iconName={IconName.Question}
              >
                {t('howQuotesWorkExplanation', [BRIDGE_MM_FEE_RATE])}
              </Tooltip>
            </Row>
            <Column height={BlockSize.Full} alignItems={AlignItems.flexEnd}>
              <Text
                as={'a'}
                variant={TextVariant.bodyMd}
                color={TextColor.primaryDefault}
                onClick={() => {
                  quoteRequestProperties &&
                    requestMetadataProperties &&
                    quoteListProperties &&
                    trackCrossChainSwapsEvent({
                      event: MetaMetricsEventName.AllQuotesOpened,
                      properties: {
                        ...quoteRequestProperties,
                        ...requestMetadataProperties,
                        ...quoteListProperties,
                      },
                    });
                  setShowAllQuotes(true);
                }}
              >
                {t('viewAllQuotes')}
              </Text>
            </Column>
          </Row>
          <Column gap={1}>
            <Row>
              <Text
                variant={TextVariant.bodyMdMedium}
                color={TextColor.textAlternativeSoft}
              >
                {t('bridging')}
              </Text>
              <Row gap={1}>
                <AvatarNetwork
                  name={fromChain?.name ?? ''}
                  src={
                    CHAIN_ID_TO_NETWORK_IMAGE_URL_MAP[
                      decimalToPrefixedHex(
                        activeQuote.quote.srcChainId,
                      ) as keyof typeof CHAIN_ID_TO_NETWORK_IMAGE_URL_MAP
                    ]
                  }
                  size={AvatarNetworkSize.Xs}
                />
                <Text>
                  {
                    NETWORK_TO_NAME_MAP[
                      decimalToPrefixedHex(
                        activeQuote.quote.srcChainId,
                      ) as keyof typeof NETWORK_TO_NAME_MAP
                    ].split(' ')[0]
                  }
                </Text>
                <Icon name={IconName.Arrow2Right} size={IconSize.Xs} />
                <AvatarNetwork
                  name={toChain?.name ?? ''}
                  src={
                    CHAIN_ID_TO_NETWORK_IMAGE_URL_MAP[
                      decimalToPrefixedHex(
                        activeQuote.quote.destChainId,
                      ) as keyof typeof CHAIN_ID_TO_NETWORK_IMAGE_URL_MAP
                    ]
                  }
                  size={AvatarNetworkSize.Xs}
                />
                <Text>
                  {
                    NETWORK_TO_NAME_MAP[
                      decimalToPrefixedHex(
                        activeQuote.quote.destChainId,
                      ) as keyof typeof NETWORK_TO_NAME_MAP
                    ].split(' ')[0]
                  }
                </Text>
              </Row>
            </Row>

            <Row>
              <Text
                variant={TextVariant.bodyMdMedium}
                color={TextColor.textAlternativeSoft}
              >
                {t('networkFees')}
              </Text>
              <Row gap={1}>
                <Text>
                  {formatCurrencyAmount(
                    activeQuote.totalNetworkFee?.valueInCurrency,
                    currency,
                    2,
                  ) ??
                    formatTokenAmount(
                      activeQuote.totalNetworkFee?.amount,
                      ticker,
                      6,
                    )}
                </Text>
                <Text color={TextColor.textAlternativeSoft}>
                  {t('bulletpoint')}
                </Text>
                <Text>
                  {activeQuote.totalNetworkFee?.valueInCurrency
                    ? formatTokenAmount(
                        activeQuote.totalNetworkFee?.amount,
                        ticker,
                        6,
                      )
                    : undefined}
                </Text>
              </Row>
            </Row>
            <Row>
              <Text
                variant={TextVariant.bodyMdMedium}
                color={TextColor.textAlternativeSoft}
              >
                {t('time')}
              </Text>
              <Text>
                {t('bridgeTimingMinutes', [
                  formatEtaInMinutes(
                    activeQuote.estimatedProcessingTimeInSeconds,
                  ),
                ])}
              </Text>
            </Row>
            <Row justifyContent={JustifyContent.flexStart} gap={2}>
              <Text
                variant={TextVariant.bodyMd}
                color={TextColor.textAlternativeSoft}
              >
                {t('rateIncludesMMFee', [BRIDGE_MM_FEE_RATE])}
              </Text>
              <Text color={TextColor.textAlternativeSoft}>
                {t('bulletpoint')}
              </Text>
              <ButtonLink
                variant={TextVariant.bodyMd}
                color={TextColor.textAlternativeSoft}
                href={TERMS_OF_USE_LINK}
                externalLink
                style={{ textDecoration: 'underline' }}
              >
                {t('bridgeTerms')}
              </ButtonLink>
            </Row>
          </Column>
        </Column>
      ) : null}
      {isNoQuotesAvailable && (
        <BannerAlert
          title={t('noOptionsAvailable')}
          severity={BannerAlertSeverity.Danger}
          description={t('noOptionsAvailableMessage')}
          textAlign={TextAlign.Left}
        />
      )}
      {!isLoading && isInsufficientGasBalance(nativeAssetBalance) && (
        <BannerAlert
          title={t('bridgeValidationInsufficientGasTitle', [ticker])}
          severity={BannerAlertSeverity.Warning}
          description={t('bridgeValidationInsufficientGasMessage', [ticker])}
          textAlign={TextAlign.Left}
          actionButtonLabel={t('buyMoreAsset', [ticker])}
          actionButtonOnClick={() => openBuyCryptoInPdapp()}
        />
      )}
    </>
  );
};

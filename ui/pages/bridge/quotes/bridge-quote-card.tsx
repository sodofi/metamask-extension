import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { Text, PopoverPosition } from '../../../components/component-library';
import { getBridgeQuotes } from '../../../ducks/bridge/selectors';
import { useI18nContext } from '../../../hooks/useI18nContext';
import {
  formatCurrencyAmount,
  formatTokenAmount,
  formatEtaInMinutes,
} from '../utils/quote';
import { useCountdownTimer } from '../../../hooks/bridge/useCountdownTimer';
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
  TextAlign,
  TextColor,
  TextVariant,
} from '../../../helpers/constants/design-system';
import { Row, Column, Tooltip } from '../layout';
import { BRIDGE_MM_FEE_RATE } from '../../../../shared/constants/bridge';
import { BridgeQuotesModal } from './bridge-quotes-modal';

export const BridgeQuoteCard = () => {
  const t = useI18nContext();
  const { isLoading, isQuoteGoingToRefresh, activeQuote } =
    useSelector(getBridgeQuotes);
  const currency = useSelector(getCurrentCurrency);
  const ticker = useSelector(getNativeCurrency);

  const secondsUntilNextRefresh = useCountdownTimer();

  const trackCrossChainSwapsEvent = useCrossChainSwapsEventTracker();
  const { quoteRequestProperties } = useRequestProperties();
  const requestMetadataProperties = useRequestMetadataProperties();
  const quoteListProperties = useQuoteProperties();

  const [showAllQuotes, setShowAllQuotes] = useState(false);

  return (
    <>
      <BridgeQuotesModal
        isOpen={showAllQuotes}
        onClose={() => setShowAllQuotes(false)}
      />
      {activeQuote ? (
        <Column gap={3}>
          <Row alignItems={AlignItems.flexStart}>
            <Column textAlign={TextAlign.Left}>
              <Row gap={1} justifyContent={JustifyContent.flexStart}>
                <Text variant={TextVariant.bodyLgMedium}>{t('bestPrice')}</Text>
                <Tooltip
                  title={t('howQuotesWork')}
                  position={PopoverPosition.TopStart}
                  offset={[-16, 16]}
                >
                  {t('howQuotesWorkExplanation', [BRIDGE_MM_FEE_RATE])}
                </Tooltip>
              </Row>
              <Text
                as={'a'}
                variant={TextVariant.bodySm}
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
            {!isLoading && isQuoteGoingToRefresh && (
              <Column height={BlockSize.Full} alignItems={AlignItems.flexEnd}>
                <Text color={TextColor.textMuted}>
                  {secondsUntilNextRefresh}
                </Text>
              </Column>
            )}
          </Row>
          <Column gap={1}>
            <Row>
              <Text color={TextColor.textAlternative}>
                {t('crossChainSwapRate')}
              </Text>
              <Text>{`1 ${
                activeQuote.quote.srcAsset.symbol
              } = ${formatTokenAmount(
                activeQuote.swapRate,
                activeQuote.quote.destAsset.symbol,
              )}`}</Text>
            </Row>
            {/* TODO add tooltip on hover */}
            <Row>
              <Text color={TextColor.textAlternative}>{t('networkFee')}</Text>
              <Row gap={1}>
                <Text color={TextColor.textMuted}>
                  {activeQuote.totalNetworkFee?.valueInCurrency
                    ? formatTokenAmount(
                        activeQuote.totalNetworkFee?.amount,
                        ticker,
                        6,
                      )
                    : undefined}
                </Text>
                <Text>
                  {formatCurrencyAmount(
                    activeQuote.totalNetworkFee?.valueInCurrency,
                    currency,
                  ) ??
                    formatTokenAmount(
                      activeQuote.totalNetworkFee?.amount,
                      ticker,
                      6,
                    )}
                </Text>
              </Row>
            </Row>
            <Row>
              <Text color={TextColor.textAlternative}>
                {t('estimatedTime')}
              </Text>
              <Text>
                {t('bridgeTimingMinutes', [
                  formatEtaInMinutes(
                    activeQuote.estimatedProcessingTimeInSeconds,
                  ),
                ])}
              </Text>
            </Row>
            <Text variant={TextVariant.bodySm} color={TextColor.textMuted}>
              {t('rateIncludesMMFee', [BRIDGE_MM_FEE_RATE])}
            </Text>
          </Column>
        </Column>
      ) : null}
    </>
  );
};

import React, { useEffect, useRef } from 'react';
import { Hex } from '@metamask/utils';
import { useSelector } from 'react-redux';
import { BigNumber } from 'bignumber.js';
import { getAccountLink, getTokenTrackerLink } from '@metamask/etherscan-link';
import { CHAIN_IDS } from '@metamask/transaction-controller';
import { SwapsTokenObject } from '../../../../shared/constants/swaps';
import {
  Text,
  TextField,
  TextFieldType,
  ButtonLink,
} from '../../../components/component-library';
import { AssetPicker } from '../../../components/multichain/asset-picker-amount/asset-picker';
import { TabName } from '../../../components/multichain/asset-picker-amount/asset-picker-modal/asset-picker-modal-tabs';
import { useI18nContext } from '../../../hooks/useI18nContext';
import { getCurrentCurrency, SwapsEthToken } from '../../../selectors';
import {
  ERC20Asset,
  NativeAsset,
} from '../../../components/multichain/asset-picker-amount/asset-picker-modal/types';
import { formatCurrencyAmount } from '../utils/quote';
import { Column, Row } from '../layout';
import {
  BlockSize,
  Display,
  FontWeight,
  TextAlign,
  TextVariant,
  TextColor,
} from '../../../helpers/constants/design-system';
import { CHAINID_DEFAULT_BLOCK_EXPLORER_HUMAN_READABLE_URL_MAP } from '../../../../shared/constants/common';
import { zeroAddress } from '../../../__mocks__/ethereumjs-util';
import { AssetType } from '../../../../shared/constants/transaction';
import {
  CHAIN_ID_TO_CURRENCY_SYMBOL_MAP,
  CHAIN_ID_TOKEN_IMAGE_MAP,
} from '../../../../shared/constants/network';
import useLatestBalance from '../../../hooks/bridge/useLatestBalance';
import {
  getBridgeQuotes,
  getValidationErrors,
} from '../../../ducks/bridge/selectors';
import { BridgeToken } from '../types';
import { BridgeAssetPickerButton } from './components/bridge-asset-picker-button';

const generateAssetFromToken = (
  chainId: Hex,
  tokenDetails: SwapsTokenObject | SwapsEthToken,
): ERC20Asset | NativeAsset => {
  if ('iconUrl' in tokenDetails && tokenDetails.address !== zeroAddress()) {
    return {
      type: AssetType.token,
      image: tokenDetails.iconUrl,
      symbol: tokenDetails.symbol,
      address: tokenDetails.address,
    };
  }

  return {
    type: AssetType.native,
    image:
      CHAIN_ID_TOKEN_IMAGE_MAP[
        chainId as keyof typeof CHAIN_ID_TOKEN_IMAGE_MAP
      ],
    symbol:
      CHAIN_ID_TO_CURRENCY_SYMBOL_MAP[
        chainId as keyof typeof CHAIN_ID_TO_CURRENCY_SYMBOL_MAP
      ],
  };
};

export const BridgeInputGroup = ({
  header,
  token,
  onAssetChange,
  onAmountChange,
  networkProps,
  customTokenListGenerator,
  amountFieldProps,
  amountInFiat,
  onMaxButtonClick,
}: {
  amountInFiat?: BigNumber;
  onAmountChange?: (value: string) => void;
  token: BridgeToken | null;
  amountFieldProps: Pick<
    React.ComponentProps<typeof TextField>,
    'testId' | 'autoFocus' | 'value' | 'readOnly' | 'disabled' | 'className'
  >;

  onMaxButtonClick?: (value: string) => void;
} & Pick<
  React.ComponentProps<typeof AssetPicker>,
  'networkProps' | 'header' | 'customTokenListGenerator' | 'onAssetChange'
>) => {
  const t = useI18nContext();

  const { isLoading } = useSelector(getBridgeQuotes);
  const { isInsufficientBalance } = useSelector(getValidationErrors);
  const currency = useSelector(getCurrentCurrency);

  const selectedChainId = networkProps?.network?.chainId;

  const blockExplorerUrl =
    networkProps?.network?.defaultBlockExplorerUrlIndex === undefined
      ? undefined
      : networkProps.network.blockExplorerUrls?.[
          networkProps.network.defaultBlockExplorerUrlIndex
        ];

  const { formattedBalance, balanceAmount } = useLatestBalance(
    token,
    selectedChainId,
  );
  const asset =
    selectedChainId && token
      ? generateAssetFromToken(selectedChainId, token)
      : undefined;

  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.value = amountFieldProps?.value?.toString() ?? '';
      inputRef.current.focus();
    }
  }, [amountFieldProps]);

  const isAmountReadOnly =
    amountFieldProps?.readOnly || amountFieldProps?.disabled;

  return (
    <Column paddingInline={4} gap={1}>
      <Row gap={4}>
        <AssetPicker
          header={header}
          visibleTabs={[TabName.TOKENS]}
          asset={asset}
          onAssetChange={onAssetChange}
          networkProps={networkProps}
          customTokenListGenerator={customTokenListGenerator}
        >
          {(onClickHandler, networkImageSrc) => (
            <BridgeAssetPickerButton
              onClick={onClickHandler}
              networkImageSrc={networkImageSrc}
              asset={asset}
              networkProps={networkProps}
            />
          )}
        </AssetPicker>

        <Column
          style={{ width: 96 }}
          display={
            isAmountReadOnly &&
            amountFieldProps.value === undefined &&
            !isLoading
              ? Display.None
              : Display.Flex
          }
        >
          <TextField
            inputRef={inputRef}
            type={TextFieldType.Text}
            className="amount-input"
            placeholder={
              isLoading && isAmountReadOnly ? t('bridgeCalculatingAmount') : '0'
            }
            onKeyPress={(e?: React.KeyboardEvent<HTMLDivElement>) => {
              // Only allow numbers and at most one decimal point
              if (
                e &&
                !/^[0-9]*\.{0,1}[0-9]*$/u.test(
                  `${amountFieldProps.value ?? ''}${e.key}`,
                )
              ) {
                e.preventDefault();
              }
            }}
            onChange={(e) => {
              // Remove characters that are not numbers or decimal points if rendering a controlled or pasted value
              const cleanedValue = e.target.value.replace(/[^0-9.]+/gu, '');
              onAmountChange?.(cleanedValue);
            }}
            endAccessory={
              (token?.symbol?.length ?? 0) > 4 ||
              (isAmountReadOnly &&
                amountFieldProps.value === undefined) ? undefined : (
                <Text
                  style={{ maxWidth: 'fit-content' }}
                  width={BlockSize.Full}
                  fontWeight={FontWeight.Medium}
                  ellipsis
                >
                  {token?.symbol}
                </Text>
              )
            }
            {...amountFieldProps}
          />
          <Text
            variant={TextVariant.bodyMd}
            fontWeight={FontWeight.Normal}
            color={TextColor.textAlternative}
            textAlign={TextAlign.End}
            ellipsis
          >
            {amountInFiat && formatCurrencyAmount(amountInFiat, currency)}
          </Text>
        </Column>
      </Row>

      <Row>
        <Text
          display={Display.Flex}
          gap={2}
          variant={TextVariant.bodySm}
          color={
            !isAmountReadOnly && isInsufficientBalance(balanceAmount)
              ? TextColor.errorDefault
              : TextColor.textAlternative
          }
          style={{ height: 20 }}
        >
          {isAmountReadOnly &&
          token?.aggregators &&
          selectedChainId &&
          blockExplorerUrl
            ? t('swapTokenVerifiedSources', [
                token.aggregators.length,
                <ButtonLink
                  key="confirmedBySources"
                  externalLink
                  variant={TextVariant.bodySm}
                  style={{ display: 'contents' }}
                  href={
                    // Use getAccountLink because zksync explorer uses a /address URL scheme instead of /token
                    selectedChainId === CHAIN_IDS.ZKSYNC_ERA
                      ? getAccountLink(token.address, selectedChainId, {
                          blockExplorerUrl,
                        })
                      : getTokenTrackerLink(
                          token.address,
                          selectedChainId,
                          '',
                          '',
                          { blockExplorerUrl },
                        )
                  }
                >
                  {CHAINID_DEFAULT_BLOCK_EXPLORER_HUMAN_READABLE_URL_MAP[
                    selectedChainId
                  ] ?? t('etherscan')}
                </ButtonLink>,
              ])
            : undefined}
          {!isAmountReadOnly && formattedBalance
            ? t('available', [formattedBalance, token?.symbol])
            : undefined}
          {onMaxButtonClick &&
            asset &&
            asset.type !== AssetType.native &&
            balanceAmount && (
              <ButtonLink
                variant={TextVariant.bodySm}
                onClick={() => onMaxButtonClick(balanceAmount?.toString())}
              >
                {t('max')}
              </ButtonLink>
            )}
        </Text>
      </Row>
    </Column>
  );
};

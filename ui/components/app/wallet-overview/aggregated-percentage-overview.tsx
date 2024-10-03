import React, { useMemo } from 'react';
import { useSelector } from 'react-redux';

import { zeroAddress, toChecksumAddress } from 'ethereumjs-util';
import {
  getCurrentCurrency,
  getSelectedAccount,
  getShouldHideZeroBalanceTokens,
  getTokensMarketData,
} from '../../../selectors';

import { useAccountTotalFiatBalance } from '../../../hooks/useAccountTotalFiatBalance';
// TODO: Remove restricted import
// eslint-disable-next-line import/no-restricted-paths
import { formatValue, isValidAmount } from '../../../../app/scripts/lib/util';
import { getIntlLocale } from '../../../ducks/locale/locale';
import {
  Display,
  TextColor,
  TextVariant,
} from '../../../helpers/constants/design-system';
import { Box, Text } from '../../component-library';
import { getCalculatedTokenAmount1dAgo } from '../../../helpers/utils/util';

// core already has this exported type but its not yet available in this version
// todo remove this and use core type once available
type MarketDataDetails = {
  tokenAddress: string;
  pricePercentChange1d: number;
};

export const AggregatedPercentageOverview = () => {
  const tokensMarketData: Record<string, MarketDataDetails> =
    useSelector(getTokensMarketData);
  const locale = useSelector(getIntlLocale);
  const fiatCurrency = useSelector(getCurrentCurrency);
  const selectedAccount = useSelector(getSelectedAccount);
  const shouldHideZeroBalanceTokens = useSelector(
    getShouldHideZeroBalanceTokens,
  );
  // Get total balance (native + tokens)
  const { totalFiatBalance, orderedTokenList } = useAccountTotalFiatBalance(
    selectedAccount,
    shouldHideZeroBalanceTokens,
  );

  // Memoize the calculation to avoid recalculating unless orderedTokenList or tokensMarketData changes
  const totalFiat1dAgo = useMemo(() => {
    return orderedTokenList.reduce((total1dAgo, item) => {
      if (item.address) {
        // This is a regular ERC20 token
        // find the relevant pricePercentChange1d in tokensMarketData
        // Find the corresponding market data for the token by filtering the values of the tokensMarketData object
        const found = tokensMarketData[toChecksumAddress(item.address)];

        const tokenFiat1dAgo = getCalculatedTokenAmount1dAgo(
          item.fiatBalance,
          found?.pricePercentChange1d,
        );
        return total1dAgo + Number(tokenFiat1dAgo);
      }
      // native token
      const nativePricePercentChange1d =
        tokensMarketData?.[zeroAddress()]?.pricePercentChange1d;
      const nativeFiat1dAgo = getCalculatedTokenAmount1dAgo(
        item.fiatBalance,
        nativePricePercentChange1d,
      );
      return total1dAgo + Number(nativeFiat1dAgo);
    }, 0); // Initial total1dAgo is 0
  }, [orderedTokenList, tokensMarketData]); // Dependencies: recalculate if orderedTokenList or tokensMarketData changes

  const totalBalance: number = Number(totalFiatBalance);
  const totalBalance1dAgo = totalFiat1dAgo;

  const amountChange = totalBalance - totalBalance1dAgo;
  const percentageChange = (amountChange / totalBalance1dAgo) * 100 || 0;

  const formattedPercentChange = formatValue(
    amountChange === 0 ? 0 : percentageChange,
    true,
  );

  let formattedAmountChange = '';
  if (isValidAmount(amountChange)) {
    formattedAmountChange = (amountChange as number) >= 0 ? '+' : '';

    const options = {
      notation: 'compact',
      compactDisplay: 'short',
      maximumFractionDigits: 2,
    } as const;

    try {
      // For currencies compliant with ISO 4217 Standard
      formattedAmountChange += `${Intl.NumberFormat(locale, {
        ...options,
        style: 'currency',
        currency: fiatCurrency,
      }).format(amountChange as number)} `;
    } catch {
      // Non-standard Currency Codes
      formattedAmountChange += `${Intl.NumberFormat(locale, {
        ...options,
        minimumFractionDigits: 2,
        style: 'decimal',
      }).format(amountChange as number)} `;
    }
  }

  let color = TextColor.textDefault;

  if (isValidAmount(amountChange)) {
    if ((amountChange as number) === 0) {
      color = TextColor.textDefault;
    } else if ((amountChange as number) > 0) {
      color = TextColor.successDefault;
    } else {
      color = TextColor.errorDefault;
    }
  }
  return (
    <Box display={Display.Flex}>
      <Text
        variant={TextVariant.bodyMdMedium}
        color={color}
        data-testid="aggregated-value-change"
        style={{ whiteSpace: 'pre' }}
        ellipsis
      >
        {formattedAmountChange}
      </Text>
      <Text
        variant={TextVariant.bodyMdMedium}
        color={color}
        data-testid="aggregated-percentage-change"
        ellipsis
      >
        {formattedPercentChange}
      </Text>
    </Box>
  );
};

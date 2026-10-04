import React from 'react';
import { View, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useP } from './AppProvider';
import { col } from './theme';
import { OnbWelcome, OnbCreating, OnbReady } from './screens/Onboarding';
import { Browse } from './screens/Browse';
import { Listing } from './screens/Listing';
import { Sell } from './screens/Sell';
import { Deals } from './screens/Deals';
import { Deal } from './screens/Deal';
import { Brief, Pack, Camera, Decide } from './screens/Recording';
import { Verdict } from './screens/Verdict';
import { Wallet } from './screens/Wallet';
import { RoleStrip, TabBar, Banner, BuySheet, OkSheet, TxSheet, FilterSheet, DevSheet } from './screens/Overlays';

export function Root() {
  const p = useP();
  const dark = p.sCamera;
  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: dark ? '#0E0E12' : col('var(--bg-screen)') }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <RoleStrip p={p} />
        <View style={{ flex: 1 }}>
          {p.sOnbWelcome ? <OnbWelcome p={p} /> : null}
          {p.sOnbCreating ? <OnbCreating /> : null}
          {p.sOnbReady ? <OnbReady p={p} /> : null}
          {p.sBrowse ? <Browse p={p} /> : null}
          {p.sListing && p.L ? <Listing p={p} /> : null}
          {p.sSell ? <Sell p={p} /> : null}
          {p.sDeals ? <Deals p={p} /> : null}
          {p.sDeal && p.D ? <Deal p={p} /> : null}
          {p.sBrief && p.B ? <Brief p={p} /> : null}
          {p.sPack && p.K ? <Pack p={p} /> : null}
          {p.sCamera && p.C ? <Camera p={p} /> : null}
          {p.sDecide && p.X ? <Decide p={p} /> : null}
          {p.sVerdict && p.V ? <Verdict p={p} /> : null}
          {p.sWallet ? <Wallet p={p} /> : null}
        </View>
        {p.showTabs ? <TabBar p={p} /> : null}
      </KeyboardAvoidingView>
      {p.sheetBuy ? <BuySheet p={p} /> : null}
      {p.sheetOk ? <OkSheet p={p} /> : null}
      {p.sheetFilters ? <FilterSheet p={p} /> : null}
      {p.hasBanner ? <Banner p={p} /> : null}
      {p.sheetDev ? <DevSheet p={p} /> : null}
      {p.hasTx ? <TxSheet p={p} /> : null}
    </SafeAreaView>
  );
}

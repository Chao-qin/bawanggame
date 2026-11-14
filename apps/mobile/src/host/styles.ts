import { StyleSheet } from 'react-native'

export const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#05070a' },
  webView: { flex: 1, backgroundColor: '#05070a' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#05070a', padding: 24 },
  title: { color: '#f3f6fb', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  message: { color: '#9ca8b8', fontSize: 14, lineHeight: 21, marginTop: 12, textAlign: 'center' },
  action: { backgroundColor: '#4da3ff', borderRadius: 10, marginTop: 24, minWidth: 140, paddingHorizontal: 22, paddingVertical: 13 },
  actionText: { color: '#07111d', fontSize: 15, fontWeight: '700', textAlign: 'center' },
})

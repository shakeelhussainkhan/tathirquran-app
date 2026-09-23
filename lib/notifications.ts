import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  if (!Device.isDevice) return false;
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleDailyNotification(hour: number, minute: number): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'تطهير القرآن',
      body: "Today's Quran verse is ready. Start your morning with the Word of Allah.",
      sound: false,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
  await AsyncStorage.setItem('notif_hour', String(hour));
  await AsyncStorage.setItem('notif_minute', String(minute));
  await AsyncStorage.setItem('notif_enabled', 'true');
}

export async function cancelNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await AsyncStorage.setItem('notif_enabled', 'false');
}

export async function getNotificationSettings(): Promise<{
  enabled: boolean;
  hour: number;
  minute: number;
}> {
  const enabled = await AsyncStorage.getItem('notif_enabled');
  const hour = await AsyncStorage.getItem('notif_hour');
  const minute = await AsyncStorage.getItem('notif_minute');
  return {
    enabled: enabled === 'true',
    hour: hour ? parseInt(hour) : 7,
    minute: minute ? parseInt(minute) : 0,
  };
}

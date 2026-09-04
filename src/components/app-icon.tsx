import React from 'react';
import { View, StyleProp, ViewStyle, ColorValue } from 'react-native';
import Svg, { Path, Circle, Rect, Polyline, Line, Polygon } from 'react-native-svg';

export interface SymbolViewProps {
  name: string | { ios?: string; android?: string; web?: string };
  size?: number;
  tintColor?: ColorValue | string;
  style?: StyleProp<ViewStyle>;
  weight?: string;
  type?: string;
}

// Universal SVG Vector Icon Renderer for Standalone Android APK, iOS & Web
export function SymbolView({ name, size = 20, tintColor = '#ffffff', style }: SymbolViewProps) {
  const iconKey = typeof name === 'string' ? name : (name?.android || name?.ios || name?.web || '');
  const key = iconKey.toLowerCase().replace(/[\._\-]/g, '');

  const color = (tintColor as string) || '#ffffff';

  const strokeProps = {
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };

  const renderIcon = () => {
    switch (true) {
      // Home / Dashboard
      case key.includes('house') || key.includes('home'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill={key.includes('fill') ? color : 'none'} />
            <Polyline points="9 22 9 12 15 12 15 22" fill={key.includes('fill') ? '#000000' : 'none'} stroke={key.includes('fill') ? '#000000' : color} />
          </Svg>
        );

      // Clients / People
      case key.includes('person2') || key.includes('people') || key.includes('users') || key.includes('group'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" fill={key.includes('fill') ? color : 'none'} />
            <Circle cx="9" cy="7" r="4" fill={key.includes('fill') ? color : 'none'} />
            <Path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <Path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </Svg>
        );

      // Single Person / User
      case key.includes('person') || key.includes('user'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" fill={key.includes('fill') ? color : 'none'} />
            <Circle cx="12" cy="7" r="4" fill={key.includes('fill') ? color : 'none'} />
          </Svg>
        );

      // Positions / Line Chart
      case key.includes('chart') || key.includes('xyaxis') || key.includes('trending') || key.includes('showchart'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Line x1="18" y1="20" x2="18" y2="10" />
            <Line x1="12" y1="20" x2="12" y2="4" />
            <Line x1="6" y1="20" x2="6" y2="14" />
            <Line x1="3" y1="20" x2="21" y2="20" />
          </Svg>
        );

      // Orders / Clipboard / Receipt
      case key.includes('clipboard') || key.includes('order') || key.includes('receipt') || key.includes('listbullet'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            <Rect x="8" y="2" width="8" height="4" rx="1" ry="1" fill={key.includes('fill') ? color : 'none'} />
            <Line x1="9" y1="12" x2="15" y2="12" />
            <Line x1="9" y1="16" x2="13" y2="16" />
          </Svg>
        );

      // More / Ellipsis
      case key.includes('ellipsis') || key.includes('more'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Circle cx="12" cy="12" r="10" fill={key.includes('fill') ? color : 'none'} />
            <Circle cx="8" cy="12" r="1.5" fill={key.includes('fill') ? '#000000' : color} stroke="none" />
            <Circle cx="12" cy="12" r="1.5" fill={key.includes('fill') ? '#000000' : color} stroke="none" />
            <Circle cx="16" cy="12" r="1.5" fill={key.includes('fill') ? '#000000' : color} stroke="none" />
          </Svg>
        );

      // Notifications / Bell Off
      case key.includes('bellslash') || key.includes('notificationsoff'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Path d="M13.73 21a2 2 0 0 1-3.46 0" />
            <Path d="M18.63 13A17.89 17.89 0 0 1 18 8" />
            <Path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
            <Path d="M18 8a6 6 0 0 0-9.33-5" />
            <Line x1="1" y1="1" x2="23" y2="23" />
          </Svg>
        );

      // Notifications / Bell Active
      case key.includes('bell') || key.includes('notification'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" fill={key.includes('fill') ? color : 'none'} />
            <Path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </Svg>
        );

      // Checkbox Checked (square with check)
      case key.includes('checksquare') || (key.includes('checkbox') && !key.includes('blank')):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Rect x="3" y="3" width="18" height="18" rx="4" fill={color} />
            <Polyline points="7 12 10 15 17 8" stroke="#ffffff" strokeWidth="2.5" />
          </Svg>
        );

      // Checkbox Blank (empty square)
      case key.includes('square') || key.includes('checkboxoutlineblank'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Rect x="3" y="3" width="18" height="18" rx="4" />
          </Svg>
        );

      // Checkmark Shield / Verified User
      case key.includes('seal') || key.includes('verifieduser') || key.includes('shieldfill') || key.includes('checkmarkshield'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill={key.includes('fill') ? color : 'none'} />
            <Polyline points="9 12 11 14 15 10" stroke={key.includes('fill') ? '#ffffff' : color} strokeWidth="2.5" />
          </Svg>
        );

      // Rosette / Verified Badge
      case key.includes('rosette') || key.includes('verified'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Path d="M12 2l2.4 2.4 3.4-.4 1.1 3.2 2.8 1.9-1.2 3.2 1.2 3.2-2.8 1.9-1.1 3.2-3.4-.4L12 22l-2.4-2.4-3.4.4-1.1-3.2-2.8-1.9 1.2-3.2-1.2-3.2 2.8-1.9 1.1-3.2 3.4.4z" fill={key.includes('fill') ? color : 'none'} />
            <Polyline points="9 12 11 14 15 10" stroke={key.includes('fill') ? '#ffffff' : color} strokeWidth="2.5" />
          </Svg>
        );

      // Plain Checkmark
      case key.includes('check'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Polyline points="20 6 9 17 4 12" strokeWidth="2.5" />
          </Svg>
        );

      // Chevrons
      case key.includes('chevronleft'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Polyline points="15 18 9 12 15 6" />
          </Svg>
        );

      case key.includes('chevronright'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Polyline points="9 18 15 12 9 6" />
          </Svg>
        );

      case key.includes('chevronup') || key.includes('expandless'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Polyline points="18 15 12 9 6 15" />
          </Svg>
        );

      case key.includes('chevrondown') || key.includes('expandmore'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Polyline points="6 9 12 15 18 9" />
          </Svg>
        );

      // Arrow Directions
      case key.includes('arrowback') || key.includes('arrowleft'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Line x1="19" y1="12" x2="5" y2="12" />
            <Polyline points="12 19 5 12 12 5" />
          </Svg>
        );

      case key.includes('arrowforward') || key.includes('arrowright'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Line x1="5" y1="12" x2="19" y2="12" />
            <Polyline points="12 5 19 12 12 19" />
          </Svg>
        );

      case key.includes('arrowupright'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Line x1="7" y1="17" x2="17" y2="7" />
            <Polyline points="7 7 17 7 17 17" />
          </Svg>
        );

      case key.includes('arrowdowncircle') || key.includes('arrowdownward') || key.includes('arrowdown'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Circle cx="12" cy="12" r="10" fill={key.includes('fill') ? color : 'none'} />
            <Polyline points="8 12 12 16 16 12" stroke={key.includes('fill') ? '#ffffff' : color} />
            <Line x1="12" y1="8" x2="12" y2="16" stroke={key.includes('fill') ? '#ffffff' : color} />
          </Svg>
        );

      case key.includes('arrowupcircle') || key.includes('arrowupward') || key.includes('arrowup'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Circle cx="12" cy="12" r="10" fill={key.includes('fill') ? color : 'none'} />
            <Polyline points="8 12 12 8 16 12" stroke={key.includes('fill') ? '#ffffff' : color} />
            <Line x1="12" y1="16" x2="12" y2="8" stroke={key.includes('fill') ? '#ffffff' : color} />
          </Svg>
        );

      // Warning / Triangle
      case key.includes('warning') || key.includes('triangle') || key.includes('exclamationmarktriangle'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" fill={key.includes('fill') ? color : 'none'} />
            <Line x1="12" y1="9" x2="12" y2="13" stroke={key.includes('fill') ? '#000000' : color} />
            <Line x1="12" y1="17" x2="12.01" y2="17" stroke={key.includes('fill') ? '#000000' : color} strokeWidth="3" />
          </Svg>
        );

      // Info / Exclamation Circle
      case key.includes('info') || key.includes('exclamationmarkcircle'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Circle cx="12" cy="12" r="10" fill={key.includes('fill') ? color : 'none'} />
            <Line x1="12" y1="16" x2="12" y2="12" stroke={key.includes('fill') ? '#000000' : color} />
            <Line x1="12" y1="8" x2="12.01" y2="8" stroke={key.includes('fill') ? '#000000' : color} strokeWidth="3" />
          </Svg>
        );

      // Plus / Add
      case key.includes('plus') || key.includes('add'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Line x1="12" y1="5" x2="12" y2="19" strokeWidth="2.5" />
            <Line x1="5" y1="12" x2="19" y2="12" strokeWidth="2.5" />
          </Svg>
        );

      // Clock / Time / History
      case key.includes('clock') || key.includes('history') || key.includes('time'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Circle cx="12" cy="12" r="10" fill={key.includes('fill') ? color : 'none'} />
            <Polyline points="12 6 12 12 16 14" stroke={key.includes('fill') ? '#000000' : color} />
          </Svg>
        );

      // Sun / Light Mode
      case key.includes('sun') || key.includes('lightmode'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Circle cx="12" cy="12" r="5" fill={key.includes('fill') ? color : 'none'} />
            <Line x1="12" y1="1" x2="12" y2="3" />
            <Line x1="12" y1="21" x2="12" y2="23" />
            <Line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <Line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <Line x1="1" y1="12" x2="3" y2="12" />
            <Line x1="21" y1="12" x2="23" y2="12" />
            <Line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <Line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </Svg>
        );

      // Moon / Dark Mode
      case key.includes('moon') || key.includes('darkmode'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill={key.includes('fill') ? color : 'none'} />
          </Svg>
        );

      // Lock / Security Shield
      case key.includes('lockshield') || key.includes('security'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill={key.includes('fill') ? color : 'none'} />
            <Rect x="9" y="11" width="6" height="5" rx="1" stroke={key.includes('fill') ? '#ffffff' : color} />
            <Path d="M10 11V9a2 2 0 1 1 4 0v2" stroke={key.includes('fill') ? '#ffffff' : color} />
          </Svg>
        );

      // Lock / Padlock
      case key.includes('lock'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Rect x="3" y="11" width="18" height="11" rx="2" ry="2" fill={key.includes('fill') ? color : 'none'} />
            <Path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </Svg>
        );

      // Key
      case key.includes('key'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Path d="M21 2l-2 2m-1.5 1.5L14 9l-3-3-2 2 3 3-5 5a5.5 5.5 0 1 1-2-2l5-5 3 3 2-2-3-3 3.5-3.5z" />
          </Svg>
        );

      // Settings / Gear
      case key.includes('gear') || key.includes('settings'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Circle cx="12" cy="12" r="3" />
            <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </Svg>
        );

      // Trash / Delete
      case key.includes('trash') || key.includes('delete'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Polyline points="3 6 5 6 21 6" />
            <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" fill={key.includes('fill') ? color : 'none'} />
          </Svg>
        );

      // Eye Slash / Visibility Off
      case key.includes('eyeslash') || key.includes('visibilityoff'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <Line x1="1" y1="1" x2="23" y2="23" />
          </Svg>
        );

      // Eye / Visibility
      case key.includes('eye') || key.includes('visibility'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <Circle cx="12" cy="12" r="3" fill={key.includes('fill') ? color : 'none'} />
          </Svg>
        );

      // Wallet
      case key.includes('wallet') || key.includes('accountbalancewallet'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
            <Path d="M3 7v12a2 2 0 0 0 2 2h16v-5" />
            <Path d="M18 12a2 2 0 0 0 0 4h4v-4z" fill={key.includes('fill') ? color : 'none'} />
          </Svg>
        );

      // Copy / Documents
      case key.includes('copy') || key.includes('docondoc'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <Path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </Svg>
        );

      // Doc badge plus / Note add
      case key.includes('docbadgeplus') || key.includes('noteadd'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <Polyline points="14 2 14 8 20 8" />
            <Line x1="12" y1="18" x2="12" y2="12" strokeWidth="2.5" />
            <Line x1="9" y1="15" x2="15" y2="15" strokeWidth="2.5" />
          </Svg>
        );

      // File / Document
      case key.includes('doc') || key.includes('file') || key.includes('assignment') || key.includes('description'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill={key.includes('fill') ? color : 'none'} />
            <Polyline points="14 2 14 8 20 8" />
            <Line x1="16" y1="13" x2="8" y2="13" stroke={key.includes('fill') ? '#ffffff' : color} />
            <Line x1="16" y1="17" x2="8" y2="17" stroke={key.includes('fill') ? '#ffffff' : color} />
          </Svg>
        );

      // Bank / Building Columns
      case key.includes('buildingcolumns') || key.includes('accountbalance'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Line x1="2" y1="22" x2="22" y2="22" />
            <Line x1="4" y1="18" x2="20" y2="18" />
            <Line x1="6" y1="18" x2="6" y2="11" />
            <Line x1="10" y1="18" x2="10" y2="11" />
            <Line x1="14" y1="18" x2="14" y2="11" />
            <Line x1="18" y1="18" x2="18" y2="11" />
            <Polygon points="12 2 2 7 22 7" fill={key.includes('fill') ? color : 'none'} />
          </Svg>
        );

      // Building 2 / Apartment / Domain / Company
      case key.includes('building') || key.includes('domain') || key.includes('apartment'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Rect x="4" y="2" width="16" height="20" rx="2" />
            <Line x1="9" y1="6" x2="9.01" y2="6" strokeWidth="2.5" />
            <Line x1="15" y1="6" x2="15.01" y2="6" strokeWidth="2.5" />
            <Line x1="9" y1="10" x2="9.01" y2="10" strokeWidth="2.5" />
            <Line x1="15" y1="10" x2="15.01" y2="10" strokeWidth="2.5" />
            <Line x1="9" y1="14" x2="9.01" y2="14" strokeWidth="2.5" />
            <Line x1="15" y1="14" x2="15.01" y2="14" strokeWidth="2.5" />
            <Path d="M10 22v-4h4v4" />
          </Svg>
        );

      // Bolt / Lightning
      case key.includes('bolt') || key.includes('flash') || key.includes('power'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill={key.includes('fill') ? color : 'none'} />
          </Svg>
        );

      // Cable / Plug / WebSocket
      case key.includes('cable') || key.includes('plug') || key.includes('hdmi'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Path d="M12 22v-5" />
            <Path d="M9 8V2" />
            <Path d="M15 8V2" />
            <Path d="M18 8v5a6 6 0 0 1-12 0V8z" fill={key.includes('fill') ? color : 'none'} />
          </Svg>
        );

      // CPU / Chip
      case key.includes('cpu') || key.includes('memory') || key.includes('chip'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Rect x="4" y="4" width="16" height="16" rx="2" />
            <Rect x="9" y="9" width="6" height="6" fill={key.includes('fill') ? color : 'none'} />
            <Line x1="9" y1="1" x2="9" y2="4" />
            <Line x1="15" y1="1" x2="15" y2="4" />
            <Line x1="9" y1="20" x2="9" y2="23" />
            <Line x1="15" y1="20" x2="15" y2="23" />
            <Line x1="20" y1="9" x2="23" y2="9" />
            <Line x1="20" y1="14" x2="23" y2="14" />
            <Line x1="1" y1="9" x2="4" y2="9" />
            <Line x1="1" y1="14" x2="4" y2="14" />
          </Svg>
        );

      // Link
      case key.includes('link'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <Path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </Svg>
        );

      // Server
      case key.includes('server') || key.includes('dns'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
            <Rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
            <Line x1="6" y1="6" x2="6.01" y2="6" strokeWidth="2.5" />
            <Line x1="6" y1="18" x2="6.01" y2="18" strokeWidth="2.5" />
          </Svg>
        );

      // Menu / 3 Horizontal Lines
      case key.includes('menu') || key.includes('line3'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Line x1="3" y1="12" x2="21" y2="12" />
            <Line x1="3" y1="6" x2="21" y2="6" />
            <Line x1="3" y1="18" x2="21" y2="18" />
          </Svg>
        );

      // Close / X
      case key.includes('close') || key.includes('xmark') || key.includes('cross'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Line x1="18" y1="6" x2="6" y2="18" />
            <Line x1="6" y1="6" x2="18" y2="18" />
          </Svg>
        );

      // Mail / Envelope
      case key.includes('mail') || key.includes('envelope'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" fill={key.includes('fill') ? color : 'none'} />
            <Polyline points="22,6 12,13 2,6" stroke={key.includes('fill') ? '#000000' : color} />
          </Svg>
        );

      // Phone
      case key.includes('phone'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          </Svg>
        );

      // Globe
      case key.includes('globe') || key.includes('public'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Circle cx="12" cy="12" r="10" />
            <Line x1="2" y1="12" x2="22" y2="12" />
            <Path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </Svg>
        );

      // Location
      case key.includes('location') || key.includes('place') || key.includes('pin'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <Circle cx="12" cy="10" r="3" />
          </Svg>
        );

      // Palette / Paintbrush
      case key.includes('palette') || key.includes('paintbrush'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Circle cx="13.5" cy="6.5" r=".5" fill={color} />
            <Circle cx="17.5" cy="10.5" r=".5" fill={color} />
            <Circle cx="8.5" cy="7.5" r=".5" fill={color} />
            <Circle cx="6.5" cy="12.5" r=".5" fill={color} />
            <Path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" fill={key.includes('fill') ? color : 'none'} />
          </Svg>
        );

      // Support / Headphones
      case key.includes('support') || key.includes('headphone'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Path d="M3 18v-6a9 9 0 0 1 18 0v6" />
            <Path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
          </Svg>
        );

      // Download
      case key.includes('download') || key.includes('filedownload'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <Polyline points="7 10 12 15 17 10" />
            <Line x1="12" y1="15" x2="12" y2="3" />
          </Svg>
        );

      // Upload / Publish
      case key.includes('upload') || key.includes('publish'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <Polyline points="17 8 12 3 7 8" />
            <Line x1="12" y1="3" x2="12" y2="15" />
          </Svg>
        );

      // Logout / Exit
      case key.includes('logout') || key.includes('rectangleportraitandarrowright') || key.includes('exit'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <Polyline points="16 17 21 12 16 7" />
            <Line x1="21" y1="12" x2="9" y2="12" />
          </Svg>
        );

      // Chat / Forum
      case key.includes('chat') || key.includes('bubble') || key.includes('forum'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill={key.includes('fill') ? color : 'none'} />
          </Svg>
        );

      // Dollar / Money
      case key.includes('dollar') || key.includes('money') || key.includes('monetization'):
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Circle cx="12" cy="12" r="10" />
            <Path d="M12 6v12M15 9.5a3.5 3.5 0 0 0-7 0c0 2 1.5 3 3.5 3s3.5 1 3.5 3a3.5 3.5 0 0 1-7 0" />
          </Svg>
        );

      // Default fallback circle
      default:
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps}>
            <Circle cx="12" cy="12" r="10" />
          </Svg>
        );
    }
  };

  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      {renderIcon()}
    </View>
  );
}

export default SymbolView;

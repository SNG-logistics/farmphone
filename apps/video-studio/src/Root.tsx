import React from 'react';
import { Composition } from 'remotion';
import { SngExpressEcommerce } from './compositions/SngExpressEcommerce';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="SNG_EXPRESS_ECOMMERCE_PREMIUM"
        component={SngExpressEcommerce}
        durationInFrames={750}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          subtitles: [
            {
              id: '1',
              startFrame: 0,
              endFrame: 75,
              text: 'เจอของถูกใจจากไทย แต่ร้านไม่ส่งลาว?',
              words: [
                { word: 'เจอของถูกใจจากไทย', startFrame: 0, endFrame: 35 },
                { word: 'แต่ร้านไม่ส่งลาว?', startFrame: 35, endFrame: 75 },
              ],
            },
            {
              id: '2',
              startFrame: 75,
              endFrame: 150,
              text: 'ปัญหานี้ SNG EXPRESS ช่วยคุณได้!',
              words: [
                { word: 'ปัญหานี้', startFrame: 75, endFrame: 100 },
                { word: 'SNG EXPRESS', startFrame: 100, endFrame: 125 },
                { word: 'ช่วยคุณได้!', startFrame: 125, endFrame: 150 },
              ],
            },
            {
              id: '3',
              startFrame: 150,
              endFrame: 270,
              text: '1. สั่งสินค้าจากร้านออนไลน์ในไทย Shopee • Lazada',
              words: [
                { word: '1. สั่งสินค้า', startFrame: 150, endFrame: 190 },
                { word: 'จากร้านออนไลน์ในไทย', startFrame: 190, endFrame: 230 },
                { word: 'Shopee • Lazada', startFrame: 230, endFrame: 270 },
              ],
            },
            {
              id: '4',
              startFrame: 270,
              endFrame: 390,
              text: '2. ส่งสินค้าเข้าคลัง SNG EXPRESS ประเทศไทย',
              words: [
                { word: '2. ส่งสินค้า', startFrame: 270, endFrame: 310 },
                { word: 'เข้าคลัง SNG EXPRESS', startFrame: 310, endFrame: 350 },
                { word: 'ประเทศไทย', startFrame: 350, endFrame: 390 },
              ],
            },
            {
              id: '5',
              startFrame: 390,
              endFrame: 525,
              text: '3. ขนส่งไทย–ลาวอย่างเป็นระบบ มีรอบรถทุกวัน',
              words: [
                { word: '3. ขนส่งไทย–ลาว', startFrame: 390, endFrame: 435 },
                { word: 'อย่างเป็นระบบ', startFrame: 435, endFrame: 480 },
                { word: 'มีรอบรถทุกวัน', startFrame: 480, endFrame: 525 },
              ],
            },
            {
              id: '6',
              startFrame: 525,
              endFrame: 630,
              text: 'ติดตามสถานะได้ มีทีมงานดูแลตลอด 24 ชั่วโมง',
              words: [
                { word: 'ติดตามสถานะได้', startFrame: 525, endFrame: 560 },
                { word: 'มีทีมงานดูแล', startFrame: 560, endFrame: 595 },
                { word: 'ตลอด 24 ชั่วโมง', startFrame: 595, endFrame: 630 },
              ],
            },
            {
              id: '7',
              startFrame: 630,
              endFrame: 750,
              text: 'ช้อปจากไทย ส่งถึงลาวง่ายขึ้น ทักสอบถาม SNG EXPRESS!',
              words: [
                { word: 'ช้อปจากไทย', startFrame: 630, endFrame: 670 },
                { word: 'ส่งถึงลาวง่ายขึ้น', startFrame: 670, endFrame: 710 },
                { word: 'ทักสอบถาม SNG EXPRESS!', startFrame: 710, endFrame: 750 },
              ],
            },
          ],
        }}
      />
    </>
  );
};

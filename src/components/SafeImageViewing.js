/*
MIT License

Copyright (c) 2019 JOB TODAY S.A.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
import React, { useCallback, useRef, useEffect } from "react";
import { Animated, Dimensions, StyleSheet, View, VirtualizedList, Modal, Pressable, Text, } from "react-native";
import ImageItem from "react-native-image-viewing/dist/components/ImageItem/ImageItem";
import { SafeAreaProvider, SafeAreaView, SafeAreaInsetsContext, SafeAreaFrameContext } from "react-native-safe-area-context";
import StatusBarManager from "react-native-image-viewing/dist/components/StatusBarManager";
import useAnimatedComponents from "react-native-image-viewing/dist/hooks/useAnimatedComponents";
import useImageIndexChange from "react-native-image-viewing/dist/hooks/useImageIndexChange";
import useRequestClose from "react-native-image-viewing/dist/hooks/useRequestClose";
// Modal composition adapted from react-native-image-viewing 0.2.2.
// Its public API has no modal content-wrapper slot. A provider outside its
// Modal (or inside a small header/footer) cannot measure the full modal window.
// Keep upstream image/zoom/swipe implementations unchanged; verify these internal
// imports and gesture behavior whenever upgrading that dependency.
const DEFAULT_ANIMATION_TYPE = "fade";
const DEFAULT_BG_COLOR = "#000";
const DEFAULT_DELAY_LONG_PRESS = 800;
const SCREEN = Dimensions.get("screen");
const SCREEN_WIDTH = SCREEN.width;
function ImageViewing({ images, keyExtractor, imageIndex, visible, onRequestClose, onLongPress = () => { }, onImageIndexChange, animationType = DEFAULT_ANIMATION_TYPE, backgroundColor = DEFAULT_BG_COLOR, presentationStyle, swipeToCloseEnabled, doubleTapToZoomEnabled, delayLongPress = DEFAULT_DELAY_LONG_PRESS, HeaderComponent, FooterComponent, }) {
    const imageList = useRef(null);
    const [opacity, onRequestCloseEnhanced] = useRequestClose(onRequestClose);
    const [currentImageIndex, onScroll] = useImageIndexChange(imageIndex, SCREEN);
    const [headerTransform, footerTransform, toggleBarsVisible] = useAnimatedComponents();
    useEffect(() => {
        if (onImageIndexChange) {
            onImageIndexChange(currentImageIndex);
        }
    }, [currentImageIndex]);
    const onZoom = useCallback((isScaled) => {
        var _a, _b;
        // @ts-ignore
        (_b = (_a = imageList) === null || _a === void 0 ? void 0 : _a.current) === null || _b === void 0 ? void 0 : _b.setNativeProps({ scrollEnabled: !isScaled });
        toggleBarsVisible(!isScaled);
    }, [imageList]);
    if (!visible) {
        return null;
    }
    return (<Modal transparent={presentationStyle === "overFullScreen"} visible={visible} presentationStyle={presentationStyle} animationType={animationType} onRequestClose={onRequestCloseEnhanced} statusBarTranslucent navigationBarTranslucent supportedOrientations={["portrait"]} hardwareAccelerated>
      {/* Wait for this full-screen modal measurement, never seed from a sheet. */}
      <SafeAreaInsetsContext.Provider value={null}>
      <SafeAreaFrameContext.Provider value={null}>
      <SafeAreaProvider>
      <StatusBarManager presentationStyle={presentationStyle}/>
      <View style={[styles.container, { opacity, backgroundColor }]}>
        <Animated.View pointerEvents="box-none" style={[styles.header, { transform: headerTransform }]}>
          {typeof HeaderComponent !== "undefined" ? (React.createElement(HeaderComponent, {
        imageIndex: currentImageIndex,
    })) : (<SafeAreaView edges={["top", "left", "right"]} pointerEvents="box-none" style={styles.closeArea}>
              <Pressable accessibilityRole="button" accessibilityLabel="Close image" testID="image-viewer-close" onPress={onRequestCloseEnhanced} style={styles.closeButton}>
                <Text style={styles.closeText}>✕</Text>
              </Pressable>
            </SafeAreaView>)}
        </Animated.View>
        <VirtualizedList ref={imageList} data={images} horizontal pagingEnabled windowSize={2} initialNumToRender={1} maxToRenderPerBatch={1} showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false} initialScrollIndex={imageIndex} getItem={(_, index) => images[index]} getItemCount={() => images.length} getItemLayout={(_, index) => ({
        length: SCREEN_WIDTH,
        offset: SCREEN_WIDTH * index,
        index,
    })} renderItem={({ item: imageSrc }) => (<ImageItem onZoom={onZoom} imageSrc={imageSrc} onRequestClose={onRequestCloseEnhanced} onLongPress={onLongPress} delayLongPress={delayLongPress} swipeToCloseEnabled={swipeToCloseEnabled} doubleTapToZoomEnabled={doubleTapToZoomEnabled}/>)} onMomentumScrollEnd={onScroll} 
    //@ts-ignore
    keyExtractor={(imageSrc, index) => keyExtractor
        ? keyExtractor(imageSrc, index)
        : typeof imageSrc === "number"
            ? `${imageSrc}`
            : imageSrc.uri}/>
        {typeof FooterComponent !== "undefined" && (<Animated.View pointerEvents="box-none" style={[styles.footer, { transform: footerTransform }]}>
            <SafeAreaView edges={["bottom", "left", "right"]} style={styles.footerSafeArea}>
            {React.createElement(FooterComponent, {
        imageIndex: currentImageIndex,
    })}
            </SafeAreaView>
          </Animated.View>)}
      </View>
      </SafeAreaProvider>
      </SafeAreaFrameContext.Provider>
      </SafeAreaInsetsContext.Provider>
    </Modal>);
}
const styles = StyleSheet.create({
    closeArea: { alignItems: "flex-end", padding: 8 },
    closeButton: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: "#00000077" },
    closeText: { color: "#fff", fontSize: 26, includeFontPadding: false },
    footerSafeArea: { backgroundColor: "#000000bb" },
    container: {
        flex: 1,
        backgroundColor: "#000",
    },
    header: {
        position: "absolute",
        width: "100%",
        zIndex: 1,
        top: 0,
    },
    footer: {
        position: "absolute",
        width: "100%",
        zIndex: 1,
        bottom: 0,
    },
});
const EnhancedImageViewing = (props) => (<ImageViewing key={props.imageIndex} {...props}/>);
export default EnhancedImageViewing;

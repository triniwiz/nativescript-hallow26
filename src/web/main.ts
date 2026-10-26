import '@nativescript/canvas-polyfill';
import { createApp, defineComponent, h } from 'nativescript-vue';
import Title from '../screens/Title.vue';
import { currentPage, setInitialPage } from './navigation';
import { Canvas, Frame, Page, Scroll, Svg, installBrowserGestures } from './components';
import './styles.css';

setInitialPage(Title);
installBrowserGestures();

const Root = defineComponent({
  name: 'HallowWeb',
  setup() {
    return () => {
      const page = currentPage.value;
      return h(
        'div',
        { class: 'web-root' },
        page ? [h(page.component, { ...page.props, key: page.key })] : [],
      );
    };
  },
});

createApp(Root)
  .component('Frame', Frame)
  .component('Page', Page)
  .component('Scroll', Scroll)
  .component('Svg', Svg)
  .component('Canvas', Canvas)
  .mount('#app');

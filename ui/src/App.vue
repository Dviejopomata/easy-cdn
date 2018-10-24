<template>
  <v-app>
    <v-toolbar>
      <v-toolbar-title class="headline text-uppercase">
        <span>CDN Dashboard</span>
      </v-toolbar-title>
    </v-toolbar>

    <v-content>
      <v-container>
        <v-breadcrumbs>
          <v-breadcrumbs-item v-for="item in breadcrumbs"
            :disabled="item.disabled" :key="item.text"
            @click.native="change(item.to)">
            {{ item.text }}
          </v-breadcrumbs-item>
        </v-breadcrumbs>
        <router-view />
      </v-container>
    </v-content>
  </v-app>
</template>

<script>
import HelloWorld from "./components/HelloWorld";
import { mapState } from "vuex";
export default {
  name: "App",
  computed: {
    ...mapState(["breadcrumbs"])
  },
  components: {
    HelloWorld
  },
  methods: {
    change(href) {
      this.$router.push(href);
    }
  },
  data() {
    return {
      //
    };
  }
};
</script>

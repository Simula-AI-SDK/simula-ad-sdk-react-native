module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: './android',
        packageImportPath: 'import com.simulaads.reactnative.SimulaMiniGamePackage;',
        packageInstance: 'new SimulaMiniGamePackage()',
      },
    },
  },
};

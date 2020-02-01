package io.mmtx.demo.mapper;

import org.apache.ibatis.annotations.Param;

public interface TestServerMapper {

	int inserTxServer(@Param("data")String data,@Param("status")String status);
}
